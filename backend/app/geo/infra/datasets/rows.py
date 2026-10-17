import csv
from collections.abc import Iterable, Iterator
from typing import Final
from uuid import UUID

from app.geo.infra.datasets.exceptions import DatasetColumnsError, MissingEnglishNameError
from app.geo.infra.datasets.identity import place_id_for

# Колонки geo_places, которые заполняет загрузчик, — в порядке значений ``PlaceRow``.
PLACE_TABLE_COLUMNS: Final[tuple[str, ...]] = (
    "id",
    "external_id",
    "kind",
    "name_en",
    "name_ru",
    "country_code",
    "latitude",
    "longitude",
    "population",
)

# Колонки файла датасета (FORMAT.md): те же, кроме id — он выводится из external_id.
CSV_COLUMNS: Final[frozenset[str]] = frozenset(PLACE_TABLE_COLUMNS) - {"id"}

type PlaceRow = tuple[UUID, str, str, str, str | None, str | None, float, float, int | None]


def iter_place_rows(*, lines: Iterable[str]) -> Iterator[PlaceRow]:
    """
    Разбирает CSV датасета в строки ``geo_places``; пустые необязательные ячейки становятся NULL.

    Args:
        lines: Строки CSV-файла, начиная с заголовка

    Yields:
        Значения колонок ``PLACE_TABLE_COLUMNS`` для одного места

    Raises:
        DatasetColumnsError: колонки файла не совпадают с ``CSV_COLUMNS``
        MissingEnglishNameError: у места пустое ``name_en``
    """
    reader = csv.DictReader(lines)
    columns = frozenset(reader.fieldnames or ())
    if columns != CSV_COLUMNS:
        raise DatasetColumnsError(columns=columns)

    for row in reader:
        if not row["name_en"]:
            raise MissingEnglishNameError(external_id=row["external_id"])

        population = row["population"]
        yield (
            place_id_for(external_id=row["external_id"]),
            row["external_id"],
            row["kind"],
            row["name_en"],
            row["name_ru"] or None,
            row["country_code"] or None,
            float(row["latitude"]),
            float(row["longitude"]),
            int(population) if population else None,
        )
