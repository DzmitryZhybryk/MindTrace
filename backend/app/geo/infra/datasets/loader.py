import gzip
from collections.abc import Iterable
from pathlib import Path
from typing import Final

import httpx
import psycopg
from psycopg import sql

from app.geo.infra.datasets.cache import ensure_cached
from app.geo.infra.datasets.manifest import DatasetSpec
from app.geo.infra.datasets.rows import CITY_TABLE_COLUMNS, iter_city_rows
from app.shared.logging import get_logger

logger = get_logger(__name__)

_CITY_COLUMNS: Final[sql.Composed] = sql.SQL(", ").join(map(sql.Identifier, CITY_TABLE_COLUMNS))

_COPY_CITIES: Final[sql.Composed] = sql.SQL("COPY geo_cities_staging ({columns}) FROM STDIN").format(
    columns=_CITY_COLUMNS,
)

_UPSERT_CITIES: Final[sql.Composed] = sql.SQL(
    "INSERT INTO geo_cities ({columns}) SELECT {columns} FROM geo_cities_staging "
    "ON CONFLICT (id) DO UPDATE SET {assignments}",
).format(
    columns=_CITY_COLUMNS,
    assignments=sql.SQL(", ").join(
        sql.SQL("{column} = EXCLUDED.{column}").format(column=sql.Identifier(column))
        for column in CITY_TABLE_COLUMNS
        if column != "id"
    ),
)


def load_datasets(
    *,
    datasets: Iterable[DatasetSpec],
    cache_dir: Path,
    dsn: str,
    http_client: httpx.Client,
) -> None:
    """
    Загружает датасеты, которых ещё нет в базе.

    Датасет с той же версией и sha256 в ``geo_dataset_loads`` пропускается. Остальные пишутся
    upsert'ом в одной транзакции вместе с записью о загрузке. Города не удаляются.

    Scenarios:
        - загрузка газеттира в базу: при развёртывании до старта приложения и в дев-стеке

    Args:
        datasets: Датасеты из манифеста
        cache_dir: Папка кеша файлов
        dsn: libpq DSN базы
        http_client: HTTP-клиент, следующий редиректам
    """
    with psycopg.connect(dsn, autocommit=True) as connection:
        for spec in datasets:
            if _is_loaded(connection=connection, spec=spec):
                logger.info("geo.dataset.skipped", dataset=spec.name, version=spec.version)
                continue

            path = ensure_cached(spec=spec, cache_dir=cache_dir, http_client=http_client)
            with connection.transaction():
                cities_count = _load_file(connection=connection, path=path)
                _record_load(connection=connection, spec=spec)

            logger.info("geo.dataset.loaded", dataset=spec.name, version=spec.version, cities=cities_count)


def _is_loaded(*, connection: psycopg.Connection, spec: DatasetSpec) -> bool:
    """
    Проверяет, загружена ли уже эта версия датасета.

    Scenarios:
        - загрузка газеттира в базу: уже загруженная версия пропускается
    """
    cursor = connection.execute(
        "SELECT 1 FROM geo_dataset_loads WHERE name = %s AND version = %s AND sha256 = %s",
        (spec.name, spec.version, spec.sha256),
    )
    return cursor.fetchone() is not None


def _load_file(*, connection: psycopg.Connection, path: Path) -> int:
    """
    Копирует файл во временную staging-таблицу и переносит её upsert'ом в ``geo_cities``.

    Scenarios:
        - загрузка газеттира в базу: при развёртывании до старта приложения и в дев-стеке

    Args:
        connection: Соединение с открытой транзакцией
        path: Проверенный файл датасета

    Returns:
        Количество городов в файле
    """
    connection.execute("CREATE TEMP TABLE geo_cities_staging (LIKE geo_cities) ON COMMIT DROP")

    cities_count = 0
    with (
        gzip.open(path, "rt", encoding="utf-8", newline="") as dataset_file,
        connection.cursor() as cursor,
        cursor.copy(_COPY_CITIES) as copy,
    ):
        for city_row in iter_city_rows(lines=dataset_file):
            copy.write_row(city_row)
            cities_count += 1

    connection.execute(_UPSERT_CITIES)
    return cities_count


def _record_load(*, connection: psycopg.Connection, spec: DatasetSpec) -> None:
    """
    Записывает загрузку датасета в журнал.

    Scenarios:
        - загрузка газеттира в базу: при развёртывании до старта приложения и в дев-стеке
    """
    connection.execute(
        """
        INSERT INTO geo_dataset_loads (name, version, sha256, loaded_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (name) DO UPDATE
        SET version = EXCLUDED.version, sha256 = EXCLUDED.sha256, loaded_at = EXCLUDED.loaded_at
        """,
        (spec.name, spec.version, spec.sha256),
    )
