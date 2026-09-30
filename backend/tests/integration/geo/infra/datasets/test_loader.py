"""
Интеграционные тесты загрузчика датасетов газеттира против реального Postgres.

Проверяют то, что на фейках не увидеть: COPY во временную таблицу, upsert в ``geo_places``,
журнал загрузок ``geo_dataset_loads`` и откат всей загрузки при битом файле. Файл отдаёт
``httpx.MockTransport`` — сеть не нужна.
"""

import gzip
from pathlib import Path

import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncEngine

from app.geo.infra.datasets.exceptions import MissingEnglishNameError
from app.geo.infra.datasets.identity import place_id_for
from app.geo.infra.datasets.loader import load_datasets
from app.shared.settings import PostgresSettings
from tests.builders import make_dataset_spec

_HEADER = "external_id,kind,name_en,name_ru,country_code,latitude,longitude,population"
_MOSCOW = "GeoNames:524901,city,Moscow,Москва,RU,55.75,37.62,10000000"
_MOSTAR = "GeoNames:3194828,city,Mostar,,BA,43.34,17.81,100000"


async def _places(db_engine: AsyncEngine) -> dict[str, tuple[str, str | None]]:
    """Содержимое ``geo_places``: external_id → (name_en, name_ru)."""
    async with db_engine.connect() as connection:
        rows = await connection.execute(sa.text("SELECT external_id, name_en, name_ru FROM geo_places"))
        return {external_id: (name_en, name_ru) for external_id, name_en, name_ru in rows}


async def _loads(db_engine: AsyncEngine) -> list[tuple[str, str]]:
    """Журнал загрузок: (name, version)."""
    async with db_engine.connect() as connection:
        rows = await connection.execute(sa.text("SELECT name, version FROM geo_dataset_loads"))
        return [(name, version) for name, version in rows]


async def test_load_datasets_inserts_places_and_records_load(
    db_engine: AsyncEngine,
    postgres_settings: PostgresSettings,
    tmp_path: Path,
) -> None:
    """load_datasets: места из файла в geo_places (пустой перевод → NULL), загрузка записана в журнал."""
    content = gzip.compress("\n".join([_HEADER, _MOSCOW, _MOSTAR]).encode())
    spec = make_dataset_spec(content=content)
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=content))

    with httpx.Client(transport=transport) as http_client:
        load_datasets(
            datasets=(spec,),
            cache_dir=tmp_path,
            dsn=postgres_settings.postgres_libpq_dsn,
            http_client=http_client,
        )

    assert await _places(db_engine) == {"GeoNames:524901": ("Moscow", "Москва"), "GeoNames:3194828": ("Mostar", None)}
    async with db_engine.connect() as connection:
        moscow_id = await connection.scalar(sa.text("SELECT id FROM geo_places WHERE external_id = 'GeoNames:524901'"))
    assert moscow_id == place_id_for(external_id="GeoNames:524901")
    assert await _loads(db_engine) == [(spec.name, spec.version)]


async def test_load_datasets_skips_already_loaded_version_without_download(
    db_engine: AsyncEngine,
    postgres_settings: PostgresSettings,
    tmp_path: Path,
) -> None:
    """load_datasets: та же версия уже в журнале → файл не скачивается, данные не трогаются."""
    content = gzip.compress("\n".join([_HEADER, _MOSCOW]).encode())
    spec = make_dataset_spec(content=content)
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, content=content)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http_client:
        load_datasets(
            datasets=(spec,),
            cache_dir=tmp_path / "first",
            dsn=postgres_settings.postgres_libpq_dsn,
            http_client=http_client,
        )
        # Второй прогон — с пустым кешем: иначе он и так не пошёл бы в сеть, и проверка была бы пустой.
        load_datasets(
            datasets=(spec,),
            cache_dir=tmp_path / "second",
            dsn=postgres_settings.postgres_libpq_dsn,
            http_client=http_client,
        )

    assert len(requests) == 1
    assert await _loads(db_engine) == [(spec.name, spec.version)]


async def test_load_datasets_new_version_upserts_places(
    db_engine: AsyncEngine,
    postgres_settings: PostgresSettings,
    tmp_path: Path,
) -> None:
    """load_datasets: новая версия обновляет существующие места, добавляет новые и заменяет запись журнала."""
    first = gzip.compress("\n".join([_HEADER, _MOSCOW]).encode())
    second = gzip.compress("\n".join([_HEADER, _MOSCOW.replace("Москва", "Москва-сити"), _MOSTAR]).encode())
    first_spec = make_dataset_spec(content=first, version="v1")
    second_spec = make_dataset_spec(content=second, version="v2")
    served = {first_spec.url: first}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=served[str(request.url)]))

    with httpx.Client(transport=transport) as http_client:
        load_datasets(
            datasets=(first_spec,),
            cache_dir=tmp_path,
            dsn=postgres_settings.postgres_libpq_dsn,
            http_client=http_client,
        )
        served[second_spec.url] = second
        load_datasets(
            datasets=(second_spec,),
            cache_dir=tmp_path,
            dsn=postgres_settings.postgres_libpq_dsn,
            http_client=http_client,
        )

    assert await _places(db_engine) == {
        "GeoNames:524901": ("Moscow", "Москва-сити"),
        "GeoNames:3194828": ("Mostar", None),
    }
    assert await _loads(db_engine) == [(second_spec.name, "v2")]


async def test_load_datasets_bad_row_rolls_back_whole_load(
    db_engine: AsyncEngine,
    postgres_settings: PostgresSettings,
    tmp_path: Path,
) -> None:
    """load_datasets: место без английского названия → ошибка, ни мест, ни записи в журнале."""
    content = gzip.compress("\n".join([_HEADER, _MOSCOW, "GeoNames:7,city,,Город,RU,1,2,3"]).encode())
    spec = make_dataset_spec(content=content)
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=content))

    with httpx.Client(transport=transport) as http_client, pytest.raises(MissingEnglishNameError):
        load_datasets(
            datasets=(spec,), cache_dir=tmp_path, dsn=postgres_settings.postgres_libpq_dsn, http_client=http_client
        )

    assert await _places(db_engine) == {}
    assert await _loads(db_engine) == []
