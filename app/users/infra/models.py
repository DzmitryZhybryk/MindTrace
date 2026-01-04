import uuid

from pydantic import EmailStr
from sqlmodel import Field, SQLModel

from app.shared.models.base_model import DateTimeMixin


class User(SQLModel, DateTimeMixin, table=True):
    id: uuid.UUID = Field(primary_key=True)
    email: EmailStr = Field(unique=True)
    password: str
