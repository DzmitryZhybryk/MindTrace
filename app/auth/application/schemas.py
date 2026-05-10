import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, ConfigDict, SecretStr

__all__ = ["ClientMetadata", "IssuedRefreshToken", "RegistrationCommand", "TokenPairResult"]


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


@dataclass(frozen=True, slots=True)
class IssuedRefreshToken:
    """Сужённый view на refresh-токен для presentation-слоя."""

    token_id: UUID
    expires_at: dt.datetime


class TokenPairResult(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    access_token: SecretStr
    refresh_token: IssuedRefreshToken
