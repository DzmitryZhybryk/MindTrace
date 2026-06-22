from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.journeys.application.services import JourneyService
from app.journeys.infra.uow import JourneyUnitOfWork
from app.shared.infra.postgres.dependency import db_session_dependency


def journey_uow_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> JourneyUnitOfWork:
    return JourneyUnitOfWork(session=session)


def journey_service_dependency(
    uow: Annotated[JourneyUnitOfWork, Depends(journey_uow_dependency)],
) -> JourneyService:
    return JourneyService(uow=uow)
