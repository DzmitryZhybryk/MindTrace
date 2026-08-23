import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, EmailStr

__all__ = ["CreateUserCommand", "CurrentUserResult"]


class CreateUserCommand(BaseModel):
    user_id: UUID
    username: str
    email: EmailStr
    marketing_emails_consent: bool
    terms_accepted_at: dt.datetime


@dataclass(frozen=True, slots=True)
class CurrentUserResult:
    username: str
    email: str
    display_name: str | None
