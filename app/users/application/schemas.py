import datetime as dt
from uuid import UUID

from pydantic import BaseModel, EmailStr

__all__ = ["UserCreate"]


class UserCreate(BaseModel):
    user_id: UUID
    username: str
    email: EmailStr
    marketing_emails_consent: bool
    terms_accepted_at: dt.datetime
