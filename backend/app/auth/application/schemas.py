import datetime as dt
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, SecretStr

__all__ = [
    "ClientMetadata",
    "IssuedRefreshToken",
    "LoginCommand",
    "RegistrationCommand",
    "TokenPairResult",
]


@dataclass(frozen=True, slots=True)
class ClientMetadata:
    ip_address: str | None = None
    user_agent: str | None = None


class RegistrationCommand(BaseModel):
    model_config = ConfigDict(frozen=True)

    username: str
    email: str
    password: SecretStr
    marketing_emails_consent: bool


class LoginCommand(BaseModel):
    model_config = ConfigDict(frozen=True)

    login: str
    password: SecretStr


class IssuedRefreshToken(BaseModel):
    """
    Сужённый view на refresh-токен для presentation-слоя.

    Plaintext-секрет уходит в HttpOnly cookie, в БД лежит только его
    детерминированный hash. ``SecretStr`` гарантирует, что секрет не утечёт
    в логи через ``repr()`` / structlog — для извлечения нужен явный
    ``get_secret_value()`` на границе HTTP.
    """

    model_config = ConfigDict(frozen=True)

    secret: SecretStr
    expires_at: dt.datetime


class TokenPairResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    access_token: SecretStr
    refresh_token: IssuedRefreshToken
