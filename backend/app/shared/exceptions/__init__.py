from app.shared.exceptions.base import (
    BaseDomainError,
    ConflictError,
    ErrorCategoryEnum,
    GoneError,
    InternalError,
    InvalidInputError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitedError,
    TemporaryError,
    UnauthenticatedError,
    UnprocessableError,
)

__all__ = [
    # Базовые исключения
    "BaseDomainError",
    "ConflictError",
    # Категории
    "ErrorCategoryEnum",
    "GoneError",
    "InternalError",
    "InvalidInputError",
    "NotFoundError",
    "PermissionDeniedError",
    "RateLimitedError",
    "TemporaryError",
    "UnauthenticatedError",
    "UnprocessableError",
]
