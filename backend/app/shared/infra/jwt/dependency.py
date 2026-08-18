from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.shared.infra.jwt.exceptions import InvalidAccessTokenError
from app.shared.infra.jwt.service import JWTDecodeError, JWTService, get_jwt_service

bearer_scheme = HTTPBearer(auto_error=False)


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

    Живёт в shared (а не в auth/presentation): это инфраструктура аутентификации
    запроса, общая для всех доменов, — иначе каждый presentation-слой зависел бы
    от auth.presentation, замыкая цикл auth ↔ users.

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
