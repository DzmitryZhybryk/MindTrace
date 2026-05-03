from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Response

from app.auth.application.schemas import TokenPairResult

REFRESH_COOKIE_NAME = "refresh_token"

RefreshTokenCookie = Annotated[UUID | None, Cookie(alias=REFRESH_COOKIE_NAME)]


def set_refresh_token_cookie(response: Response, token_pair: TokenPairResult) -> None:
    """
    Устанавливает refresh-токен в HttpOnly Secure cookie.

    HttpOnly защищает токен от XSS (недоступен из JavaScript), Secure
    передаёт cookie только по HTTPS, SameSite=lax ограничивает отправку
    при cross-site запросах.

    Args:
        response: HTTP-ответ FastAPI, в который добавляется cookie
        token_pair: Пара токенов, из которой берётся refresh-токен и его срок жизни
    """
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=str(token_pair.refresh_token.token_id),
        httponly=True,
        secure=True,
        samesite="lax",
        expires=int(token_pair.refresh_token.expires_at.timestamp()),
    )


def clear_refresh_token_cookie(response: Response) -> None:
    """
    Удаляет refresh-токен из cookie клиента.

    Атрибуты ``httponly``/``secure``/``samesite`` должны совпадать с теми,
    что использовались при установке: иначе браузер не сматчит cookie и
    оставит её на клиенте. Используется на logout и в любых других местах,
    где сессия должна быть очищена.

    Args:
        response: HTTP-ответ FastAPI, из которого удаляется cookie
    """
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=True,
        samesite="lax",
    )
