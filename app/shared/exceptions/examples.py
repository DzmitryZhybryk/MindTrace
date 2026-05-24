"""Утилиты для описания ошибок API."""

from app.shared.exceptions.base import BaseDomainError
from app.shared.types import DictStrAny


def error_response_example(error_cls: type[BaseDomainError]) -> DictStrAny:
    """Вернуть словарь для примера `ErrorResponse` по исключению."""

    return {
        "code": error_cls.code,
        "message": error_cls.message,
        "details": error_cls.details,
        "timestamp": "2024-01-01T12:00:00Z",
    }
