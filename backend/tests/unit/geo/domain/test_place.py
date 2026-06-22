"""Unit-тесты доменных ``PlaceNames``/``Place`` — резолв имени под язык и фоллбэк на en."""

from uuid import uuid4

from app.geo.domain.entities import Place
from app.geo.domain.enums import Language
from app.geo.domain.value_objects import PlaceNames


def test_place_names_get_returns_localized_without_fallback() -> None:
    """PlaceNames.get: возвращает имя на языке, либо None если перевода нет (без фоллбэка)."""
    names = PlaceNames(en="Moscow", ru="Москва")

    assert names.get(language=Language.EN) == "Moscow"
    assert names.get(language=Language.RU) == "Москва"


def test_place_names_get_returns_none_for_missing_translation() -> None:
    """PlaceNames.get: нет ru-перевода → None (сигнал отсутствия, не фоллбэк)."""
    names = PlaceNames(en="Mostar")

    assert names.get(language=Language.RU) is None


def test_place_names_display_falls_back_to_en() -> None:
    """PlaceNames.display: нет перевода на язык → канонический en."""
    names = PlaceNames(en="Mostar")

    assert names.display(language=Language.RU) == "Mostar"
    assert names.display(language=Language.EN) == "Mostar"


def test_place_localized_name_signals_missing_translation() -> None:
    """Place.localized_name: без ru-перевода возвращает None — сигнал качества данных для сервиса."""
    place = Place(
        place_id=uuid4(),
        names=PlaceNames(en="Mostar"),
        country_code="BA",
        latitude=43.3,
        longitude=17.8,
        population=100_000,
    )

    assert place.localized_name(language=Language.RU) is None


def test_place_display_name_resolves_under_language_with_fallback() -> None:
    """Place.display_name: отдаёт имя на языке, иначе фоллбэк на en."""
    place = Place(
        place_id=uuid4(),
        names=PlaceNames(en="Moscow", ru="Москва"),
        country_code="RU",
        latitude=55.75,
        longitude=37.62,
        population=10_000_000,
    )

    assert place.display_name(language=Language.RU) == "Москва"
    assert place.display_name(language=Language.EN) == "Moscow"
