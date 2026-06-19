from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status

from app.auth.presentation.dependencies import current_user_id_dependency
from app.journeys.application.schemas import CreateJourneyCommand, PlaceSnapshot
from app.journeys.application.services import JourneyService
from app.journeys.presentation.dependencies import journey_service_dependency
from app.journeys.presentation.responses import CREATE_JOURNEY_RESPONSES
from app.journeys.presentation.schemas import CreateJourneyRequest

journey_router = APIRouter()


@journey_router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    responses=CREATE_JOURNEY_RESPONSES,
)
async def create_journey(
    body: CreateJourneyRequest,
    user_id: Annotated[UUID, Depends(current_user_id_dependency)],
    journey_service: Annotated[JourneyService, Depends(journey_service_dependency)],
) -> Response:
    command = CreateJourneyCommand(
        user_id=user_id,
        origin=PlaceSnapshot(
            name=body.origin.name,
            country_code=body.origin.country_code,
            latitude=body.origin.latitude,
            longitude=body.origin.longitude,
        ),
        destination=PlaceSnapshot(
            name=body.destination.name,
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
