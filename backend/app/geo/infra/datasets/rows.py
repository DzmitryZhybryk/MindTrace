import csv
from collections.abc import Iterable, Iterator
from typing import Final
from uuid import UUID

from app.geo.infra.datasets.exceptions import DatasetColumnsError, MissingCountryCodeError, MissingEnglishNameError
from app.geo.infra.datasets.identity import gazetteer_id_for

# Колонки geo_cities, которые заполняет загрузчик, — в порядке значений ``CityRow``.
CITY_TABLE_COLUMNS: Final[tuple[str, ...]] = (
    "id",
    "external_id",
    "name_en",
    "name_ru",
    "country_code",
    "latitude",
    "longitude",
    "population",
)

# Колонки файла датасета (FORMAT.md): те же, кроме id — он выводится из external_id.
CSV_COLUMNS: Final[frozenset[str]] = frozenset(CITY_TABLE_COLUMNS) - {"id"}

type CityRow = tuple[UUID, str, str, str | None, str, float, float, int | None]


def iter_city_rows(*, lines: Iterable[str]) -> Iterator[CityRow]:
    """
    Разбирает CSV датасета в строки ``geo_cities``; пустые необязательные ячейки становятся NULL.

    Scenarios:
        - загрузка газеттира в базу: при развёртывании до старта приложения и в дев-стеке

    Args:
        lines: Строки CSV-файла, начиная с заголовка

    Yields:
        Значения колонок ``CITY_TABLE_COLUMNS`` для одного города

    Raises:
        DatasetColumnsError: колонки файла не совпадают с ``CSV_COLUMNS``
        MissingEnglishNameError: у города пустое ``name_en``
        MissingCountryCodeError: у города пустое ``country_code``
    """
    reader = csv.DictReader(lines)
    columns = frozenset(reader.fieldnames or ())
    if columns != CSV_COLUMNS:
        raise DatasetColumnsError(columns=columns)

    for row in reader:
        if not row["name_en"]:
            raise MissingEnglishNameError(external_id=row["external_id"])

        if not row["country_code"]:
            raise MissingCountryCodeError(external_id=row["external_id"])

        population = row["population"]
        yield (
            gazetteer_id_for(external_id=row["external_id"]),
            row["external_id"],
            row["name_en"],
            row["name_ru"] or None,
            row["country_code"],
            float(row["latitude"]),
            float(row["longitude"]),
            int(population) if population else None,
        )
