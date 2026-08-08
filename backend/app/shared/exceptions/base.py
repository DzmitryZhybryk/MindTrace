"""Базовые исключения для доменов."""

from enum import Enum
from typing import ClassVar

from app.shared.types import OptionalDict


class ErrorCategory(Enum):
    """
    Транспортно-нейтральная категория доменной ошибки.

    Домен классифицирует род сбоя в собственных терминах и НЕ знает про HTTP,
    gRPC и прочие транспорты. Перевод категории в конкретный код транспорта —
    забота адаптера (HTTP-handler, будущий gRPC-handler и т.д.).
    """

    INVALID_INPUT = "invalid_input"
    UNAUTHENTICATED = "unauthenticated"
    PERMISSION_DENIED = "permission_denied"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    GONE = "gone"
    UNPROCESSABLE = "unprocessable"
    RATE_LIMITED = "rate_limited"
    INTERNAL = "internal"


class BaseDomainError(Exception):
    """
    Базовое исключение для всех доменных ошибок.

    Все доменные исключения должны наследоваться от этого класса.
    Дочерние классы могут задать атрибуты класса `category`, `code` и `message`
    для дефолтных значений.

    Поле `category` несёт транспортно-нейтральный род ошибки (см. `ErrorCategory`):
    адаптер транспорта переводит его в свой код (HTTP-статус и т.п.).
    Поле `code` — стабильный машинно-читаемый идентификатор ошибки для клиента
    (часть API-контракта). Поле `details` несёт дополнительную метаинформацию
    (например, ``{"field": "email"}`` для подсветки конкретного поля формы);
    классовый дефолт для него наследники задают через `default_details` —
    отдельный ClassVar-канал, чтобы классовая константа не переопределяла
    инстанс-атрибут `details`.
    """

    category: ErrorCategory = ErrorCategory.INTERNAL
    code: str = "unknown_error"
    message: str = "Произошла ошибка"
    default_details: ClassVar[OptionalDict] = None

    def __init__(
        self,
        message: str | None = None,
        code: str | None = None,
        details: OptionalDict = None,
    ) -> None:
        if message is None:
            message = self.message

        if code is None:
            code = self.code

        if details is None:
            details = self.default_details

        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


class InvalidInputError(BaseDomainError):
    """Базовое исключение для ошибок валидации и некорректного ввода."""

    category = ErrorCategory.INVALID_INPUT
    code = "invalid_input"
    message = "Некорректный запрос"


class UnauthenticatedError(BaseDomainError):
    """Базовое исключение для ошибок аутентификации."""

    category = ErrorCategory.UNAUTHENTICATED
    code = "unauthenticated"
    message = "Требуется авторизация"


class PermissionDeniedError(BaseDomainError):
    """Базовое исключение для ошибок доступа."""

    category = ErrorCategory.PERMISSION_DENIED
    code = "permission_denied"
    message = "Доступ запрещен"


class NotFoundError(BaseDomainError):
    """Базовое исключение для ошибок "ресурс не найден"."""

    category = ErrorCategory.NOT_FOUND
    code = "not_found"
    message = "Ресурс не найден"


class ConflictError(BaseDomainError):
    """Базовое исключение для конфликтов данных."""

    category = ErrorCategory.CONFLICT
    code = "conflict"
    message = "Конфликт данных"


class GoneError(BaseDomainError):
    """Базовое исключение для ресурсов, которые когда-то были и истекли."""

    category = ErrorCategory.GONE
    code = "gone"
    message = "Ресурс больше недоступен"


class UnprocessableError(BaseDomainError):
    """Базовое исключение для ошибок обработки корректно сформированной сущности."""

    category = ErrorCategory.UNPROCESSABLE
    code = "unprocessable"
    message = "Невозможно обработать запрос"


class RateLimitedError(BaseDomainError):
    """Базовое исключение для ошибок превышения лимита запросов."""

    category = ErrorCategory.RATE_LIMITED
    code = "rate_limited"
    message = "Превышен лимит запросов"


class InternalError(BaseDomainError):
    """Базовое исключение для внутренних ошибок сервера."""

    category = ErrorCategory.INTERNAL
    code = "internal"
    message = "Внутренняя ошибка сервера"
