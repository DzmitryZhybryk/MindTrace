from dataclasses import dataclass
from uuid import UUID

__all__ = [
    "PlaceLocation",
    "PlaceSearchItem",
    "PlaceSearchResult",
    "PlacesByIdsResult",
    "ResolvePlacesResult",
    "ResolvedPlace",
]


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
class ResolvedPlace:
    """Название места на языке запроса."""

    place_id: UUID
    name: str


@dataclass(frozen=True, slots=True)
class ResolvePlacesResult:
    """Названия найденных мест."""

    items: tuple[ResolvedPlace, ...]


@dataclass(frozen=True, slots=True)
class PlaceLocation:
    """Где находится место: страна (у части мест её нет) и координаты."""

    place_id: UUID
    country_code: str | None
    latitude: float
    longitude: float


@dataclass(frozen=True, slots=True)
class PlacesByIdsResult:
    """Найденные места в произвольном порядке; несуществующих id здесь нет."""

    items: tuple[PlaceLocation, ...]
