from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from app.journeys.application.schemas import CreateJourneyCommand, GetMovementsMapCommand
from app.journeys.application.services import JourneyService
from app.journeys.domain.value_objects import GeoPoint
from app.journeys.presentation.dependencies import journey_service_dependency
from app.journeys.presentation.responses import (
    CREATE_JOURNEY_RESPONSES,
    JOURNEYS_GLOBE_RESPONSES,
    JOURNEYS_MAP_RESPONSES,
    MOVEMENTS_MAP_RESPONSES,
)
from app.journeys.presentation.schemas import (
    CreateJourneyRequest,
    JourneysGlobeResponse,
    JourneysMapResponse,
    MapCountry,
    MapPoint,
    MovementConnection,
    MovementsMapFilterRequest,
    MovementsMapResponse,
)
from app.shared.infra.jwt import current_user_id_dependency

journey_router = APIRouter()


@journey_router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    responses=CREATE_JOURNEY_RESPONSES,
)
async def create_journey(
    *,
    body: CreateJourneyRequest,
    user_id: Annotated[UUID, Depends(current_user_id_dependency)],
    journey_service: Annotated[JourneyService, Depends(journey_service_dependency)],
) -> Response:
    command = CreateJourneyCommand(
        user_id=user_id,
        origin=GeoPoint(
            place_id=body.origin.place_id,
            country_code=body.origin.country_code,
            latitude=body.origin.latitude,
            longitude=body.origin.longitude,
        ),
        destination=GeoPoint(
            place_id=body.destination.place_id,
            country_code=body.destination.country_code,
            latitude=body.destination.latitude,
            longitude=body.destination.longitude,
        ),
        transport_type=body.transport_type,
        traveled_year=body.traveled_year,
        traveled_month=body.traveled_month,
        traveled_day=body.traveled_day,
    )
    await journey_service.create_journey(command=command)
    return Response(status_code=status.HTTP_201_CREATED)


@journey_router.get(
    "/map",
    response_model=JourneysMapResponse,
    responses=JOURNEYS_MAP_RESPONSES,
)
async def get_journeys_map(
    *,
    user_id: Annotated[UUID, Depends(current_user_id_dependency)],
    journey_service: Annotated[JourneyService, Depends(journey_service_dependency)],
) -> JourneysMapResponse:
    result = await journey_service.get_journeys_map(user_id=user_id)
    countries = [MapCountry.model_validate(country, from_attributes=True) for country in result.countries]
    return JourneysMapResponse(countries=countries)


@journey_router.get(
    "/globe",
    response_model=JourneysGlobeResponse,
    responses=JOURNEYS_GLOBE_RESPONSES,
)
async def get_journeys_globe(
    *,
    user_id: Annotated[UUID, Depends(current_user_id_dependency)],
    journey_service: Annotated[JourneyService, Depends(journey_service_dependency)],
) -> JourneysGlobeResponse:
    result = await journey_service.get_journeys_globe(user_id=user_id)
    places = [MapPoint.model_validate(place, from_attributes=True) for place in result.places]
    return JourneysGlobeResponse(places=places)


@journey_router.get(
    "/movements",
    response_model=MovementsMapResponse,
    responses=MOVEMENTS_MAP_RESPONSES,
)
async def get_movements_map(
    *,
    filters: Annotated[MovementsMapFilterRequest, Query()],
    user_id: Annotated[UUID, Depends(current_user_id_dependency)],
    journey_service: Annotated[JourneyService, Depends(journey_service_dependency)],
) -> MovementsMapResponse:
    command = GetMovementsMapCommand(
        user_id=user_id,
        transport_types=filters.transport_type,
    )
    result = await journey_service.get_movements_map(command=command)
    connections = [
        MovementConnection.model_validate(connection, from_attributes=True) for connection in result.connections
    ]
    return MovementsMapResponse(first_year=result.first_year, last_year=result.last_year, connections=connections)
