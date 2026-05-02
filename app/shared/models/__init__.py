from sqlalchemy.orm import DeclarativeBase

from app.shared.models.base_model import DateTimeMixin


class BaseDBModel(DeclarativeBase):
    """Базовый класс декларативных моделей. Используется в миграциях Alembic."""


__all__ = [
    "BaseDBModel",
    "DateTimeMixin",
]
