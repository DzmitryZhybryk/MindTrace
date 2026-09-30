from dataclasses import dataclass
from uuid import UUID

from app.geo.domain.enums import Language

__all__ = [
    "PlaceSearchItem",
    "PlaceSearchResult",
    "ResolvePlacesCommand",
    "ResolvePlacesResult",
    "ResolvedPlace",
    "SearchPlacesCommand",
]


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
    """Один вариант в подсказках поиска; имя — на языке запроса."""

    place_id: UUID
    name: str
    country_code: str | None
    latitude: float
    longitude: float
    population: int | None


@dataclass(frozen=True, slots=True)
class PlaceSearchResult:
    """Результат поиска — упорядоченная выдача кандидатов."""

    items: tuple[PlaceSearchItem, ...]


@dataclass(frozen=True, slots=True)
class ResolvePlacesCommand:
    """Запрос названий мест по их id на нужном языке."""

    place_ids: tuple[UUID, ...]
    language: Language


@dataclass(frozen=True, slots=True)
class ResolvedPlace:
    """Название места на языке запроса."""

    place_id: UUID
    name: str


@dataclass(frozen=True, slots=True)
class ResolvePlacesResult:
    """Названия найденных мест."""

    items: tuple[ResolvedPlace, ...]
