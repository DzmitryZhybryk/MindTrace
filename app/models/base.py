import datetime as dt

from sqlmodel import Field


class DateTimeMixin:
    """
    Mixin для добавления полей дат создания, обновления и удаления.
    """

    created_at: dt.datetime = Field(default_factory=dt.datetime.now)
    updated_at: dt.datetime | None = Field(default=None)
    deleted_at: dt.datetime | None = Field(default=None)
