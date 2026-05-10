from app.shared.exceptions.base import (
    BadRequestError,
    BaseDomainError,
    ConflictError,
    ForbiddenError,
    GoneError,
    NotFoundError,
    ServerError,
    TooManyRequestsError,
    UnauthorizedError,
    UnprocessableEntityError,
)
from app.shared.exceptions.examples import error_response_example
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
    "GoneError",
    "NotFoundError",
    "ServerError",
    "TooManyRequestsError",
    "UnauthorizedError",
    "UnprocessableEntityError",
    "error_response_example",
    # Обработчики
    "register_exception_handlers",
]
