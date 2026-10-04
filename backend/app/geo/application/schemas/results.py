from dataclasses import dataclass
from uuid import UUID

__all__ = [
    "MissingPlaceIdsResult",
    "PlaceSearchItem",
    "PlaceSearchResult",
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
class MissingPlaceIdsResult:
    """Id мест, которых нет в газеттире; пусто, если все на месте."""

    place_ids: frozenset[UUID]
