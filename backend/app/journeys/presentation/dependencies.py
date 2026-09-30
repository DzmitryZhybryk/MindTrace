from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.application.services import PlaceService
from app.geo.presentation.dependencies import place_service_dependency
from app.journeys.application.services import JourneyService
from app.journeys.infra.clients.internal_places_client import InternalPlacesClient
from app.journeys.infra.uow import JourneyUnitOfWork
from app.shared.infra.postgres.dependency import db_session_dependency


def journey_uow_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> JourneyUnitOfWork:
    return JourneyUnitOfWork(session=session)


def places_client_dependency(
    place_service: Annotated[PlaceService, Depends(place_service_dependency)],
) -> InternalPlacesClient:
    return InternalPlacesClient(place_service=place_service)


def journey_service_dependency(
    uow: Annotated[JourneyUnitOfWork, Depends(journey_uow_dependency)],
    places_client: Annotated[InternalPlacesClient, Depends(places_client_dependency)],
) -> JourneyService:
    return JourneyService(uow=uow, places_client=places_client)
