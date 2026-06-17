from dataclasses import dataclass

from app.geo.domain.enums import Language

__all__ = ["CitySearchItem", "CitySearchResult", "SearchCitiesCommand"]


@dataclass(frozen=True, slots=True)
class SearchCitiesCommand:
    """
    Намерение «найти города по префиксу имени» — вход ``CityService.search_cities``.

    Транспортный объект без валидации/семантических типов → dataclass (см. DTO
    conventions).
    """

    search_text: str
    language: Language
    limit: int


@dataclass(frozen=True, slots=True)
class CitySearchItem:
    """Один кандидат автокомплита — имя уже резолвнуто под язык запроса."""

    geoname_id: int
    name: str
    country_code: str
    latitude: float
    longitude: float
    population: int


@dataclass(frozen=True, slots=True)
class CitySearchResult:
    """Результат поиска — упорядоченная выдача кандидатов."""

    items: tuple[CitySearchItem, ...]
