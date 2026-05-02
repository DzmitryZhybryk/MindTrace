from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.schemas import ClientMetadata
from app.auth.application.services import AuthService
from app.auth.infra.clients.internal_users_client import InternalUsersClient
from app.auth.infra.uow import AuthUnitOfWork
from app.shared.dependencies.db_dependency import db_session_dependency
from app.shared.infra.jwt_service import JWTService
from app.shared.infra.password_hasher import Argon2PasswordHasher
from app.shared.settings import settings
from app.users.application.services import UserService
from app.users.infra.user_uow import UserUnitOfWork


def client_metadata_dependency(request: Request) -> ClientMetadata:
    return ClientMetadata(
        ip_address=request.client and request.client.host,
        user_agent=request.headers.get("user-agent"),
    )


def auth_uow_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> AuthUnitOfWork:
    return AuthUnitOfWork(session=session)


def users_client_dependency(
    session: Annotated[AsyncSession, Depends(db_session_dependency)],
) -> InternalUsersClient:
    uow = UserUnitOfWork(session=session)
    return InternalUsersClient(user_service=UserService(uow=uow))


def jwt_service_dependency() -> JWTService:
    return JWTService(
        secret=settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
        access_token_expire_minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
    )


def auth_service_dependency(
    uow: Annotated[AuthUnitOfWork, Depends(auth_uow_dependency)],
    users_client: Annotated[InternalUsersClient, Depends(users_client_dependency)],
    jwt_service: Annotated[JWTService, Depends(jwt_service_dependency)],
) -> AuthService:
    return AuthService(
        users_client=users_client,
        uow=uow,
        hasher=Argon2PasswordHasher(),
        jwt_service=jwt_service,
        refresh_token_ttl_days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS,
    )
