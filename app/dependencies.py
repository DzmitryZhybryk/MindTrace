"""Общие зависимости для приложения."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.services import AuthService
from app.auth.infra import AuthUnitOfWork
from app.shared.infra.components import SessionMaker
from app.shared.schemas.base import BFastAPI

__all__ = [
    "auth_service_dependency",
    "auth_uow_dependency",
    "db_session_dependency",
]


async def db_session_dependency(request: Request) -> AsyncGenerator[AsyncSession]:
    """Общая зависимость для получения сессии БД."""
    app: BFastAPI = request.app
    sessionmaker = app.registry.get(SessionMaker)
    async with sessionmaker() as session:
        yield session


def auth_uow_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> AuthUnitOfWork:
    """Зависимость для получения AuthUnitOfWork. Может использоваться в разных доменах."""
    return AuthUnitOfWork(session=session)


def auth_service_dependency(
    uow: Annotated[AuthUnitOfWork, Depends(auth_uow_dependency)],
) -> AuthService:
    """Зависимость для получения AuthService. Может использоваться в разных доменах."""
    return AuthService(uow=uow)
