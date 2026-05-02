from enum import StrEnum


class UserRole(StrEnum):
    """Роль пользователя, определяющая уровень доступа и привилегии."""

    FREE = "free"
    PREMIUM = "premium"
    ADMIN = "admin"
