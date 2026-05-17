from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.auth_service import AuthService
from app.auth.application.email_verification_service import EmailVerificationService
from app.auth.application.schemas import ClientMetadata
from app.auth.application.settings import EmailVerificationSettings, get_email_verification_settings
from app.auth.application.token_issuer import TokenIssuer
from app.auth.exceptions import InvalidAccessTokenError, InvalidRefreshTokenError
from app.auth.infra.clients.internal_users_client import InternalUsersClient
from app.auth.infra.uow import AuthUnitOfWork
from app.auth.presentation.cookies import read_refresh_token_cookie
from app.shared.infra.crypto import (
    DeterministicHasher,
    SaltedHasher,
    get_argon2_salted_hasher,
    get_sha256_deterministic_hasher,
)
from app.shared.infra.jwt import JWTDecodeError, JWTService, get_jwt_service
from app.shared.infra.postgres.dependency import db_session_dependency
from app.shared.infra.procrastinate import TaskBus
from app.shared.schemas.base import BFastAPI
from app.shared.settings import settings
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


def email_verification_settings_dependency() -> EmailVerificationSettings:
    return get_email_verification_settings()


def task_bus_dependency(request: Request) -> TaskBus:
    app: BFastAPI = request.app
    return app.registry.get(TaskBus)


def salted_hasher_dependency() -> SaltedHasher:
    """
    Возвращает salt-устойчивый hasher для паролей и OTP-кодов.

    Stateless singleton на процесс (см. ``get_argon2_salted_hasher``).
    Через override этой dependency тесты подменяют реализацию.
    """
    return get_argon2_salted_hasher()


def deterministic_hasher_dependency() -> DeterministicHasher:
    """
    Возвращает детерминированный hasher для refresh-token lookup'а по индексу.

    Stateless singleton на процесс (см. ``get_sha256_deterministic_hasher``).
    Через override этой dependency тесты подменяют реализацию.
    """
    return get_sha256_deterministic_hasher()


def optional_refresh_secret_dependency(request: Request) -> str | None:
    """
    Возвращает plaintext-секрет refresh-токена из cookie или ``None``.

    Используется в /logout: операция идемпотентна и должна 204'нуть даже без cookie.
    """
    return read_refresh_token_cookie(request=request)


def required_refresh_secret_dependency(request: Request) -> str:
    """
    Возвращает plaintext-секрет refresh-токена из cookie или 401.

    Используется в /refresh: без cookie ротация невозможна, поэтому
    отсутствие cookie — это уже ошибка аутентификации, а не валидации тела.

    Raises:
        InvalidRefreshTokenError: Cookie ``refresh_token`` отсутствует
    """
    secret = read_refresh_token_cookie(request=request)
    if secret is None:
        raise InvalidRefreshTokenError()

    return secret


def email_verification_service_dependency(
    uow: Annotated[AuthUnitOfWork, Depends(auth_uow_dependency)],
    salted_hasher: Annotated[SaltedHasher, Depends(salted_hasher_dependency)],
    task_bus: Annotated[TaskBus, Depends(task_bus_dependency)],
    email_verification_settings: Annotated[EmailVerificationSettings, Depends(email_verification_settings_dependency)],
) -> EmailVerificationService:
    return EmailVerificationService(
        uow=uow,
        salted_hasher=salted_hasher,
        task_bus=task_bus,
        email_verification_settings=email_verification_settings,
    )


def token_issuer_dependency(
    deterministic_hasher: Annotated[DeterministicHasher, Depends(deterministic_hasher_dependency)],
    jwt_service: Annotated[JWTService, Depends(jwt_service_dependency)],
) -> TokenIssuer:
    return TokenIssuer(
        deterministic_hasher=deterministic_hasher,
        jwt_service=jwt_service,
        refresh_token_ttl_days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS,
    )


def auth_service_dependency(
    uow: Annotated[AuthUnitOfWork, Depends(auth_uow_dependency)],
    users_client: Annotated[InternalUsersClient, Depends(users_client_dependency)],
    salted_hasher: Annotated[SaltedHasher, Depends(salted_hasher_dependency)],
    token_issuer: Annotated[TokenIssuer, Depends(token_issuer_dependency)],
    email_verification_service: Annotated[EmailVerificationService, Depends(email_verification_service_dependency)],
) -> AuthService:
    return AuthService(
        uow=uow,
        users_client=users_client,
        salted_hasher=salted_hasher,
        token_issuer=token_issuer,
        email_verification_service=email_verification_service,
    )
