from fastapi import Response

from app.auth.application.schemas import TokenPairResult

_REFRESH_COOKIE_NAME = "refresh_token"


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
        key=_REFRESH_COOKIE_NAME,
        value=str(token_pair.refresh_token.token_id),
        httponly=True,
        secure=True,
        samesite="lax",
        expires=int(token_pair.refresh_token.expires_at.timestamp()),
    )
