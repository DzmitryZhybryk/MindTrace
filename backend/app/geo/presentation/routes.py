from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.geo.application.schemas import SearchPlacesCommand
from app.geo.application.services import PlaceService
from app.geo.domain.enums import Language
from app.geo.presentation.dependencies import place_service_dependency
from app.geo.presentation.responses import SEARCH_PLACES_RESPONSES
from app.geo.presentation.schemas import PlaceResponse, PlaceSearchResponse
from app.shared.infra.jwt import current_user_id_dependency

geo_router = APIRouter()


@geo_router.get(
    "/places/search/",
    response_model=PlaceSearchResponse,
    responses=SEARCH_PLACES_RESPONSES,
    dependencies=[Depends(current_user_id_dependency)],
)
async def search_places(
    place_service: Annotated[PlaceService, Depends(place_service_dependency)],
    search_text: Annotated[
        str,
        Query(alias="searchText", min_length=1, max_length=100, description="Поисковый запрос (часть имени)."),
    ],
    language: Annotated[Language, Query(description="Язык отображаемых имён.")],
    limit: Annotated[int, Query(ge=1, le=50, description="Максимум кандидатов в выдаче.")] = 10,
) -> PlaceSearchResponse:
    command = SearchPlacesCommand(search_text=search_text, language=language, limit=limit)
    result = await place_service.search_places(command=command)
    items = [PlaceResponse.model_validate(item, from_attributes=True) for item in result.items]
    return PlaceSearchResponse(items=items)
