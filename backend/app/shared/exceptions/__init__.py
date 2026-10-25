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

__all__ = [
    # Базовые исключения
    "BaseDomainError",
    "ConflictError",
    # Категории
    "ErrorCategory",
    "GoneError",
    "InternalError",
    "InvalidInputError",
    "NotFoundError",
    "PermissionDeniedError",
    "RateLimitedError",
    "UnauthenticatedError",
    "UnprocessableError",
]
