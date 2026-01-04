"""Константы responses для документации OpenAPI."""

from typing import Final

from app.shared.exceptions import ErrorResponse
from app.shared.types import DictStrAny

__all__ = [
    "REGISTER_USER_RESPONSES",
]


# Responses для роута регистрации пользователя
REGISTER_USER_RESPONSES: Final[dict[int, DictStrAny]] = {
    400: {
        "description": "Ошибка валидации данных",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": {
                    "code": "passwords_do_not_match",
                    "message": "Пароли не совпадают",
                    "details": None,
                    "timestamp": "2024-01-01T12:00:00",
                }
            }
        },
    },
    500: {
        "description": "Внутренняя ошибка сервера",
        "model": ErrorResponse,
    },
}
