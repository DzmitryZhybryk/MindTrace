from sqlmodel import SQLModel

from app.models.user import User

BaseDBModel = SQLModel

__all__ = [
    "BaseDBModel",
    "User",
]
