from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.geo.domain.enums import Language
from app.shared.schemas import CamelModel


class PlaceSearchItem(CamelModel):
    """Один вариант в подсказках поиска; по ``placeId`` на место потом можно ссылаться."""

    place_id: UUID
    name: Annotated[str, Field(description="Имя места, резолвнутое под язык запроса (параметр language).")]
    country_code: str | None
    latitude: float
    longitude: float
    population: int | None


class PlaceSearchResponse(CamelModel):
    """Ответ автокомплита — упорядоченная выдача кандидатов (по убыванию населения)."""

    items: list[PlaceSearchItem]


class ResolvePlacesRequest(CamelModel):
    """Запрос названий мест по их id на нужном языке."""

    place_ids: Annotated[list[UUID], Field(min_length=1, max_length=1000)]
    language: Language


class PlaceName(CamelModel):
    """Название места на языке запроса."""

    place_id: UUID
    name: str


class ResolvePlacesResponse(CamelModel):
    """Названия найденных мест; id, которых нет в газеттире, в ответ не попадают."""

    items: list[PlaceName]
