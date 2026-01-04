from sqlmodel import SQLModel

from app.shared.models.base_model import Base, DateTimeMixin

# BaseDBModel используется в миграциях Alembic
BaseDBModel = SQLModel

__all__ = [
    "Base",
    "BaseDBModel",
    "DateTimeMixin",
]
