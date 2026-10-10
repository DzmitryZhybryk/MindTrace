from dataclasses import dataclass
from uuid import UUID

from app.geo.domain.enums import Language

__all__ = [
    "GetPlacesByIdsCommand",
    "ResolvePlacesCommand",
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
class ResolvePlacesCommand:
    """Запрос названий мест по их id на нужном языке."""

    place_ids: tuple[UUID, ...]
    language: Language


@dataclass(frozen=True, slots=True)
class GetPlacesByIdsCommand:
    """Id мест, страну и координаты которых нужно отдать."""

    place_ids: frozenset[UUID]
