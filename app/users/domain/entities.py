import datetime as dt
from uuid import UUID

from pydantic import BaseModel


class UserEntity(BaseModel):
    id: UUID
    username: str
    email: str
    password: str
    created_at: dt.datetime
    updated_at: dt.datetime | None = None
    deleted_at: dt.datetime | None = None
