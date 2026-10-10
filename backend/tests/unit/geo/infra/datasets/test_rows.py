"""Unit-тесты разбора CSV датасета в строки ``geo_places``."""

import pytest

from app.geo.infra.datasets.exceptions import DatasetColumnsError, MissingEnglishNameError
from app.geo.infra.datasets.identity import place_id_for
from app.geo.infra.datasets.rows import iter_place_rows

_HEADER = "external_id,kind,name_en,name_ru,country_code,latitude,longitude,population"


def test_iter_place_rows_parses_full_row() -> None:
    """iter_place_rows: строка файла → значения колонок, id выведен из external_id."""
    lines = [_HEADER, "GeoNames:524901,city,Moscow,Москва,RU,55.75,37.62,10000000"]

    [row] = list(iter_place_rows(lines=lines))

    assert row == (
        place_id_for(external_id="GeoNames:524901"),
        "GeoNames:524901",
        "city",
        "Moscow",
        "Москва",
        "RU",
        55.75,
        37.62,
        10_000_000,
    )


def test_iter_place_rows_empty_optional_cells_become_none() -> None:
    """iter_place_rows: пустые name_ru, country_code и population — NULL, а не пустая строка."""
    lines = [_HEADER, "GeoNames:1,sea,Black Sea,,,43.4,34.3,"]

    [row] = list(iter_place_rows(lines=lines))

    assert row[4:6] == (None, None)
    assert row[8] is None


def test_iter_place_rows_accepts_columns_in_any_order() -> None:
    """iter_place_rows: порядок колонок в файле не важен — важен набор."""
    lines = [
        "name_en,external_id,kind,name_ru,country_code,latitude,longitude,population",
        "Moscow,GeoNames:524901,city,Москва,RU,55.75,37.62,10000000",
    ]

    [row] = list(iter_place_rows(lines=lines))

    assert row[1] == "GeoNames:524901"
    assert row[3] == "Moscow"


@pytest.mark.parametrize(
    "header",
    [
        "external_id,kind,name_en,country_code,latitude,longitude,population",
        f"{_HEADER},name_de",
    ],
    ids=["missing-column", "extra-column"],
)
def test_iter_place_rows_rejects_unexpected_columns(header: str) -> None:
    """iter_place_rows: набор колонок не как в формате → DatasetColumnsError до разбора строк."""
    with pytest.raises(DatasetColumnsError):
        list(iter_place_rows(lines=[header]))


def test_iter_place_rows_rejects_place_without_english_name() -> None:
    """iter_place_rows: место без английского названия → MissingEnglishNameError с его ключом."""
    lines = [_HEADER, "GeoNames:7,city,,Москва,RU,55.75,37.62,1"]

    with pytest.raises(MissingEnglishNameError, match="GeoNames:7"):
        list(iter_place_rows(lines=lines))
