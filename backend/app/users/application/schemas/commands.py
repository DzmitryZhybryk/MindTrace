import datetime as dt
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

__all__ = ["CreateUserCommand"]


class CreateUserCommand(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    username: str
    email: EmailStr
    marketing_emails_consent: bool
    terms_accepted_at: dt.datetime
