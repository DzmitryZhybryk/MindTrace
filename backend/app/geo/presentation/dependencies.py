from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.application.services.place import PlaceService
from app.geo.infra.uow import GeoUnitOfWork
from app.shared.infra.postgres.dependency import db_session_dependency


def geo_uow_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> GeoUnitOfWork:
    return GeoUnitOfWork(session=session)


def place_service_dependency(
    uow: Annotated[GeoUnitOfWork, Depends(geo_uow_dependency)],
) -> PlaceService:
    return PlaceService(uow=uow)
