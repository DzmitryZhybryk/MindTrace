from dataclasses import dataclass
from uuid import UUID

from app.geo.domain.enums import Language

__all__ = ["PlaceSearchItem", "PlaceSearchResult", "SearchPlacesCommand"]


@dataclass(frozen=True, slots=True)
class SearchPlacesCommand:
    """
    Намерение «найти места по префиксу имени» — вход ``PlaceService.search_places``.

    Транспортный объект без валидации/семантических типов → dataclass (см. DTO
    conventions).
    """

    search_text: str
    language: Language
    limit: int


@dataclass(frozen=True, slots=True)
class PlaceSearchItem:
    """
    Один кандидат автокомплита — имя уже резолвнуто под язык запроса.

    ``place_id`` — суррогатный id справочника (UUID), стабильный ключ кандидата для фронта
    (выбор/React-key); вендорский ключ источника наружу не отдаётся. На create этот id НЕ
    уходит — поездка снапшотит данные места (имя/координаты), не ссылку на справочник.
    """

    place_id: UUID
    name: str
    country_code: str
    latitude: float
    longitude: float
    population: int


@dataclass(frozen=True, slots=True)
class PlaceSearchResult:
    """Результат поиска — упорядоченная выдача кандидатов."""

    items: tuple[PlaceSearchItem, ...]
