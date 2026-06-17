from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.presentation.dependencies import current_user_id_dependency
from app.geo.application.schemas import SearchCitiesCommand
from app.geo.application.services import CityService
from app.geo.domain.enums import Language
from app.geo.presentation.dependencies import city_service_dependency
from app.geo.presentation.schemas import CityResponse, CitySearchResponse

geo_router = APIRouter()


@geo_router.get(
    "/cities/search/",
    response_model=CitySearchResponse,
    dependencies=[Depends(current_user_id_dependency)],
)
async def search_cities(
    city_service: Annotated[CityService, Depends(city_service_dependency)],
    search_text: Annotated[str, Query(min_length=1, max_length=100, description="Поисковый запрос (часть имени).")],
    language: Annotated[Language, Query(description="Язык отображаемых имён.")],
    limit: Annotated[int, Query(ge=1, le=50, description="Максимум кандидатов в выдаче.")] = 10,
) -> CitySearchResponse:
    command = SearchCitiesCommand(search_text=search_text, language=language, limit=limit)
    result = await city_service.search_cities(command=command)
    items = [CityResponse.model_validate(item, from_attributes=True) for item in result.items]
    return CitySearchResponse(items=items)
