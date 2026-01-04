from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import db_session_dependency
from app.users.application.services import UserService
from app.users.infra.user_uow import UserUnitOfWork


def user_uow_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> UserUnitOfWork:
    """Зависимость для получения UserUnitOfWork."""
    return UserUnitOfWork(session=session)


def user_service_dependency(
    uow: Annotated[UserUnitOfWork, Depends(user_uow_dependency)],
) -> UserService:
    """Зависимость для получения UserService."""
    return UserService(uow=uow)
