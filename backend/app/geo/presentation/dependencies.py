from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.application.services import PlaceService
from app.geo.infra.repositories import PlaceRepository
from app.shared.infra.postgres.dependency import db_session_dependency


def place_repository_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> PlaceRepository:
    return PlaceRepository(session=session)


def place_service_dependency(
    repository: Annotated[PlaceRepository, Depends(place_repository_dependency)],
) -> PlaceService:
    return PlaceService(repository=repository)
