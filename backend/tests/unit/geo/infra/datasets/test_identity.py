"""Unit-тесты вывода id объекта газеттира из ключа поставщика."""

from uuid import UUID

from app.geo.infra.datasets.identity import gazetteer_id_for

# Зафиксированный id Москвы. Если тест упал — сменились id всех объектов газеттира, а на них
# ссылаются поездки: такое изменение ломает данные, а не просто тест.
_MOSCOW_CITY_ID = UUID("a3e026e1-ade0-527d-b9aa-e02300de5053")


def test_gazetteer_id_for_is_pinned() -> None:
    """gazetteer_id_for: id объекта не меняется между версиями кода и окружениями."""
    assert gazetteer_id_for(external_id="GeoNames:524901") == _MOSCOW_CITY_ID


def test_gazetteer_id_for_is_deterministic() -> None:
    """gazetteer_id_for: один ключ поставщика всегда даёт один и тот же id."""
    assert gazetteer_id_for(external_id="GeoNames:1") == gazetteer_id_for(external_id="GeoNames:1")


def test_gazetteer_id_for_distinguishes_sources() -> None:
    """gazetteer_id_for: одинаковый номер у разных поставщиков — разные объекты."""
    assert gazetteer_id_for(external_id="GeoNames:1") != gazetteer_id_for(external_id="OSM:1")
