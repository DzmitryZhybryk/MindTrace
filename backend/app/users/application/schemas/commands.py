import datetime as dt
from uuid import UUID

from pydantic import BaseModel, ConfigDict

__all__ = ["CreateUserCommand"]


class CreateUserCommand(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    display_name: str
    marketing_emails_consent: bool
    terms_accepted_at: dt.datetime
