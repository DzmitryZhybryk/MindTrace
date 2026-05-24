from app.shared.exceptions.base import (
    BaseDomainError,
    ConflictError,
    ErrorCategory,
    GoneError,
    InternalError,
    InvalidInputError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitedError,
    UnauthenticatedError,
    UnprocessableError,
)
from app.shared.exceptions.examples import error_response_example
from app.shared.exceptions.handlers import register_exception_handlers
from app.shared.exceptions.schemas import ErrorResponse

__all__ = [
    # Базовые исключения
    "BaseDomainError",
    "ConflictError",
    # Категории
    "ErrorCategory",
    # Схемы
    "ErrorResponse",
    "GoneError",
    "InternalError",
    "InvalidInputError",
    "NotFoundError",
    "PermissionDeniedError",
    "RateLimitedError",
    "UnauthenticatedError",
    "UnprocessableError",
    "error_response_example",
    # Обработчики
    "register_exception_handlers",
]
