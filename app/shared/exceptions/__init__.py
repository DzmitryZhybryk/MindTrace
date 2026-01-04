from app.shared.exceptions.base import (
    BadRequestError,
    BaseDomainError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServerError,
    TooManyRequestsError,
    UnauthorizedError,
    UnprocessableEntityError,
)
from app.shared.exceptions.handlers import register_exception_handlers
from app.shared.exceptions.schemas import ErrorResponse

__all__ = [
    # Базовые исключения
    "BadRequestError",
    "BaseDomainError",
    "ConflictError",
    # Схемы
    "ErrorResponse",
    "ForbiddenError",
    "NotFoundError",
    "ServerError",
    "TooManyRequestsError",
    "UnauthorizedError",
    "UnprocessableEntityError",
    # Обработчики
    "register_exception_handlers",
]
