from typing import Annotated

from pydantic import BaseModel, Field


class CityResponse(BaseModel):
    """Кандидат автокомплита для фронта."""

    geoname_id: int
    name: Annotated[str, Field(description="Имя города, резолвнутое под язык запроса (параметр lang).")]
    country_code: str
    latitude: float
    longitude: float
    population: int


class CitySearchResponse(BaseModel):
    """Ответ автокомплита — упорядоченная выдача кандидатов (по убыванию населения)."""

    items: list[CityResponse]
