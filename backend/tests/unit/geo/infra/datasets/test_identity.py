"""Unit-тесты вывода id места из ключа поставщика."""

from uuid import UUID

from app.geo.infra.datasets.identity import place_id_for

# Зафиксированный id Москвы. Если тест упал — сменились id всех мест, а на них ссылаются
# поездки: такое изменение ломает данные, а не просто тест.
_MOSCOW_PLACE_ID = UUID("a3e026e1-ade0-527d-b9aa-e02300de5053")


def test_place_id_for_is_pinned() -> None:
    """place_id_for: id места не меняется между версиями кода и окружениями."""
    assert place_id_for(external_id="GeoNames:524901") == _MOSCOW_PLACE_ID


def test_place_id_for_is_deterministic() -> None:
    """place_id_for: один ключ поставщика всегда даёт один и тот же id."""
    assert place_id_for(external_id="GeoNames:1") == place_id_for(external_id="GeoNames:1")


def test_place_id_for_distinguishes_sources() -> None:
    """place_id_for: одинаковый номер у разных поставщиков — разные места."""
    assert place_id_for(external_id="GeoNames:1") != place_id_for(external_id="OSM:1")
