import datetime as dt

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


class DateTimeMixin:
    """
    Mixin для добавления полей дат создания, обновления и удаления.
    """

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: dt.datetime.now(tz=dt.UTC),
    )
    updated_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    deleted_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), default=None)
