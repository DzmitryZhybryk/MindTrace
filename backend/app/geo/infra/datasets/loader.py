import gzip
from collections.abc import Iterable
from pathlib import Path
from typing import Final

import httpx
import psycopg
from psycopg import sql

from app.geo.infra.datasets.cache import ensure_cached
from app.geo.infra.datasets.manifest import DatasetSpec
from app.geo.infra.datasets.rows import PLACE_TABLE_COLUMNS, iter_place_rows
from app.shared.logging import get_logger

logger = get_logger(__name__)

_PLACE_COLUMNS: Final[sql.Composed] = sql.SQL(", ").join(map(sql.Identifier, PLACE_TABLE_COLUMNS))

_COPY_PLACES: Final[sql.Composed] = sql.SQL("COPY geo_places_staging ({columns}) FROM STDIN").format(
    columns=_PLACE_COLUMNS,
)

_UPSERT_PLACES: Final[sql.Composed] = sql.SQL(
    "INSERT INTO geo_places ({columns}) SELECT {columns} FROM geo_places_staging "
    "ON CONFLICT (id) DO UPDATE SET {assignments}",
).format(
    columns=_PLACE_COLUMNS,
    assignments=sql.SQL(", ").join(
        sql.SQL("{column} = EXCLUDED.{column}").format(column=sql.Identifier(column))
        for column in PLACE_TABLE_COLUMNS
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
    upsert'ом в одной транзакции вместе с записью о загрузке. Места не удаляются.

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
                places_count = _load_file(connection=connection, path=path)
                _record_load(connection=connection, spec=spec)

            logger.info("geo.dataset.loaded", dataset=spec.name, version=spec.version, places=places_count)


def _is_loaded(*, connection: psycopg.Connection, spec: DatasetSpec) -> bool:
    """Проверяет, загружена ли уже эта версия датасета."""
    cursor = connection.execute(
        "SELECT 1 FROM geo_dataset_loads WHERE name = %s AND version = %s AND sha256 = %s",
        (spec.name, spec.version, spec.sha256),
    )
    return cursor.fetchone() is not None


def _load_file(*, connection: psycopg.Connection, path: Path) -> int:
    """
    Копирует файл во временную staging-таблицу и переносит её upsert'ом в ``geo_places``.

    Args:
        connection: Соединение с открытой транзакцией
        path: Проверенный файл датасета

    Returns:
        Количество мест в файле
    """
    connection.execute("CREATE TEMP TABLE geo_places_staging (LIKE geo_places) ON COMMIT DROP")

    places_count = 0
    with (
        gzip.open(path, "rt", encoding="utf-8", newline="") as dataset_file,
        connection.cursor() as cursor,
        cursor.copy(_COPY_PLACES) as copy,
    ):
        for place_row in iter_place_rows(lines=dataset_file):
            copy.write_row(place_row)
            places_count += 1

    connection.execute(_UPSERT_PLACES)
    return places_count


def _record_load(*, connection: psycopg.Connection, spec: DatasetSpec) -> None:
    """Записывает загрузку датасета в журнал."""
    connection.execute(
        """
        INSERT INTO geo_dataset_loads (name, version, sha256, loaded_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (name) DO UPDATE
        SET version = EXCLUDED.version, sha256 = EXCLUDED.sha256, loaded_at = EXCLUDED.loaded_at
        """,
        (spec.name, spec.version, spec.sha256),
    )
