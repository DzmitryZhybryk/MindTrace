import datetime as dt
import uuid

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import BaseDBModel
from app.shared.models.base_model import DateTimeMixin


class UserCredentials(DateTimeMixin, BaseDBModel):
    __tablename__ = "user_credentials"

    user_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str]
    role: Mapped[str] = mapped_column(String(20))
    email_verified_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), default=None)
