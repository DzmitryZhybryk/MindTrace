import datetime as dt
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import BaseDBModel
from app.shared.models.base_model import DateTimeMixin


class EmailVerificationToken(DateTimeMixin, BaseDBModel):
    __tablename__ = "email_verification_token"
    __table_args__ = (
        # Один активный токен на пользователя; обеспечивается партиальным unique-индексом.
        # Должен совпадать с миграцией `e00067cc5c0e`.
        Index(
            "ix_email_verification_token_active_user_id",
            "user_id",
            unique=True,
            postgresql_where=text("used_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_credentials.user_id", ondelete="CASCADE"),
    )
    code_hash: Mapped[str] = mapped_column(Text())
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)
    used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), default=None)
