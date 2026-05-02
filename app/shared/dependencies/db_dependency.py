"""Общие зависимости для приложения."""

from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.infra.components import SessionMaker
from app.shared.schemas.base import BFastAPI

__all__ = [
    "db_session_dependency",
]


async def db_session_dependency(request: Request) -> AsyncGenerator[AsyncSession]:
    """Общая зависимость для получения сессии БД."""
    app: BFastAPI = request.app
    sessionmaker = app.registry.get(SessionMaker)
    async with sessionmaker() as session:
        yield session
