from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.shared.schemas import CamelModel


class PlaceResponse(CamelModel):
    """
    Кандидат автокомплита для фронта.

    ``place_id`` (наружу ``placeId``) — суррогатный id справочника, стабильный ключ
    кандидата для выбора/рендера; вендорский ключ источника наружу не отдаётся. На create
    он НЕ уходит — поездка снапшотит данные места (имя/координаты), не ссылку.
    """

    place_id: UUID
    name: Annotated[str, Field(description="Имя места, резолвнутое под язык запроса (параметр language).")]
    country_code: str
    latitude: float
    longitude: float
    population: int


class PlaceSearchResponse(CamelModel):
    """Ответ автокомплита — упорядоченная выдача кандидатов (по убыванию населения)."""

    items: list[PlaceResponse]
