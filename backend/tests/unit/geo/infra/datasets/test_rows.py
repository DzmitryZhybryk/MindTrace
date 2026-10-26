"""Unit-тесты разбора CSV датасета в строки ``geo_cities``."""

import pytest

from app.geo.infra.datasets.exceptions import DatasetColumnsError, MissingCountryCodeError, MissingEnglishNameError
from app.geo.infra.datasets.identity import gazetteer_id_for
from app.geo.infra.datasets.rows import iter_city_rows

_HEADER = "external_id,name_en,name_ru,country_code,latitude,longitude,population"


def test_iter_city_rows_parses_full_row() -> None:
    """iter_city_rows: строка файла → значения колонок, id выведен из external_id."""
    lines = [_HEADER, "GeoNames:524901,Moscow,Москва,RU,55.75,37.62,10000000"]

    [row] = list(iter_city_rows(lines=lines))

    assert row == (
        gazetteer_id_for(external_id="GeoNames:524901"),
        "GeoNames:524901",
        "Moscow",
        "Москва",
        "RU",
        55.75,
        37.62,
        10_000_000,
    )


def test_iter_city_rows_empty_optional_cells_become_none() -> None:
    """iter_city_rows: пустые name_ru и population — NULL, а не пустая строка."""
    lines = [_HEADER, "GeoNames:1,Town,,FR,43.4,3.4,"]

    [row] = list(iter_city_rows(lines=lines))

    assert row[3] is None
    assert row[7] is None


def test_iter_city_rows_accepts_columns_in_any_order() -> None:
    """iter_city_rows: порядок колонок в файле не важен — важен набор."""
    lines = [
        "name_en,external_id,name_ru,country_code,latitude,longitude,population",
        "Moscow,GeoNames:524901,Москва,RU,55.75,37.62,10000000",
    ]

    [row] = list(iter_city_rows(lines=lines))

    assert row[1] == "GeoNames:524901"
    assert row[2] == "Moscow"


@pytest.mark.parametrize(
    "header",
    [
        "external_id,name_en,country_code,latitude,longitude,population",
        f"{_HEADER},name_de",
        "external_id,kind,name_en,name_ru,country_code,latitude,longitude,population",
    ],
    ids=["missing-column", "extra-column", "legacy-kind-column"],
)
def test_iter_city_rows_rejects_unexpected_columns(header: str) -> None:
    """iter_city_rows: набор колонок не как в формате → DatasetColumnsError до разбора строк."""
    with pytest.raises(DatasetColumnsError):
        list(iter_city_rows(lines=[header]))


def test_iter_city_rows_rejects_city_without_english_name() -> None:
    """iter_city_rows: город без английского названия → MissingEnglishNameError с его ключом."""
    lines = [_HEADER, "GeoNames:7,,Москва,RU,55.75,37.62,1"]

    with pytest.raises(MissingEnglishNameError, match="GeoNames:7"):
        list(iter_city_rows(lines=lines))


def test_iter_city_rows_rejects_city_without_country() -> None:
    """iter_city_rows: город без страны → MissingCountryCodeError с его ключом, а не NULL в базе."""
    lines = [_HEADER, "GeoNames:8,Town,,,55.75,37.62,1"]

    with pytest.raises(MissingCountryCodeError, match="GeoNames:8"):
        list(iter_city_rows(lines=lines))
