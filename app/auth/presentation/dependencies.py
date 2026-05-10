from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.schemas import ClientMetadata
from app.auth.application.services import AuthService
from app.auth.application.settings import AuthServiceSettings, get_auth_service_settings
from app.auth.exceptions import InvalidAccessTokenError
from app.auth.infra.clients.internal_users_client import InternalUsersClient
from app.auth.infra.uow import AuthUnitOfWork
from app.shared.dependencies.db_dependency import db_session_dependency
from app.shared.infra.jwt_service import JWTDecodeError, JWTService, get_jwt_service
from app.shared.infra.secret_hasher import Argon2SecretHasher
from app.users.application.services import UserService
from app.users.infra.user_uow import UserUnitOfWork

bearer_scheme = HTTPBearer(auto_error=False)


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
    return get_jwt_service()


def current_user_id_dependency(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    jwt_service: Annotated[JWTService, Depends(jwt_service_dependency)],
) -> UUID:
    """
    Извлекает ``user_id`` из Bearer access-токена.

    Заголовок ``Authorization: Bearer <token>`` обязателен — отсутствие
    или невалидный токен (просроченная подпись, искажённый формат, чужой
    secret) приводят к 401 ``InvalidAccessTokenError``.

    Args:
        credentials: Распарсенный ``Authorization`` (или ``None`` если заголовка нет)
        jwt_service: Сервис подписи/декодирования JWT

    Returns:
        UUID пользователя из claim'а ``sub``

    Raises:
        InvalidAccessTokenError: Заголовок отсутствует или токен не прошёл валидацию
    """
    if credentials is None:
        raise InvalidAccessTokenError()

    try:
        return jwt_service.decode_access_token(token=credentials.credentials)
    except JWTDecodeError as exc:
        raise InvalidAccessTokenError() from exc


def auth_service_settings_dependency() -> AuthServiceSettings:
    return get_auth_service_settings()


def auth_service_dependency(
    uow: Annotated[AuthUnitOfWork, Depends(auth_uow_dependency)],
    users_client: Annotated[InternalUsersClient, Depends(users_client_dependency)],
    jwt_service: Annotated[JWTService, Depends(jwt_service_dependency)],
    auth_settings: Annotated[AuthServiceSettings, Depends(auth_service_settings_dependency)],
) -> AuthService:
    return AuthService(
        uow=uow,
        users_client=users_client,
        hasher=Argon2SecretHasher(),
        jwt_service=jwt_service,
        auth_settings=auth_settings,
    )
