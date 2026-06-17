from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.application.services import CityService
from app.geo.infra.repositories import CityRepository
from app.shared.infra.postgres.dependency import db_session_dependency


def city_repository_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> CityRepository:
    return CityRepository(session=session)


def city_service_dependency(
    repository: Annotated[CityRepository, Depends(city_repository_dependency)],
) -> CityService:
    return CityService(repository=repository)
