"""Базовые исключения для доменов."""

from enum import Enum
from typing import ClassVar

from app.shared.types import OptionalDict


class ErrorCategoryEnum(Enum):
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
    UNAVAILABLE = "unavailable"
    INTERNAL = "internal"

    @property
    def is_server_side(self) -> bool:
        """
        Сбой на стороне сервера, а не в запросе клиента.

        Клиенту уходят только код и сообщение класса: инстансовое сообщение и ``details`` несут
        контекст сбоя для лога, где исключение пишется целиком, вместе с причиной.
        """
        return self in (ErrorCategoryEnum.UNAVAILABLE, ErrorCategoryEnum.INTERNAL)


class BaseDomainError(Exception):
    """
    Базовое исключение для всех доменных ошибок.

    Все доменные исключения должны наследоваться от этого класса.
    Дочерние классы могут задать атрибуты класса `category`, `code` и `message`
    для дефолтных значений.

    Поле `category` несёт транспортно-нейтральный род ошибки (см. `ErrorCategoryEnum`):
    адаптер транспорта переводит его в свой код (HTTP-статус и т.п.).
    Поле `code` — стабильный машинно-читаемый идентификатор ошибки для клиента
    (часть API-контракта). Поле `details` несёт дополнительную метаинформацию
    (например, ``{"field": "email"}`` для подсветки конкретного поля формы);
    классовый дефолт для него наследники задают через `default_details` —
    отдельный ClassVar-канал, чтобы классовая константа не переопределяла
    инстанс-атрибут `details`. У серверных категорий (`ErrorCategoryEnum.is_server_side`)
    `details` и инстансовое `message` до клиента не доходят — только до лога.
    """

    category: ErrorCategoryEnum = ErrorCategoryEnum.INTERNAL
    code: str = "unknown_error"
    message: str = "Произошла ошибка"
    default_details: ClassVar[OptionalDict] = None

    def __init__(
        self,
        *,
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

    category = ErrorCategoryEnum.INVALID_INPUT
    code = "invalid_input"
    message = "Некорректный запрос"


class UnauthenticatedError(BaseDomainError):
    """Базовое исключение для ошибок аутентификации."""

    category = ErrorCategoryEnum.UNAUTHENTICATED
    code = "unauthenticated"
    message = "Требуется авторизация"


class PermissionDeniedError(BaseDomainError):
    """Базовое исключение для ошибок доступа."""

    category = ErrorCategoryEnum.PERMISSION_DENIED
    code = "permission_denied"
    message = "Доступ запрещен"


class NotFoundError(BaseDomainError):
    """Базовое исключение для ошибок "ресурс не найден"."""

    category = ErrorCategoryEnum.NOT_FOUND
    code = "not_found"
    message = "Ресурс не найден"


class ConflictError(BaseDomainError):
    """Базовое исключение для конфликтов данных."""

    category = ErrorCategoryEnum.CONFLICT
    code = "conflict"
    message = "Конфликт данных"


class GoneError(BaseDomainError):
    """Базовое исключение для ресурсов, которые когда-то были и истекли."""

    category = ErrorCategoryEnum.GONE
    code = "gone"
    message = "Ресурс больше недоступен"


class UnprocessableError(BaseDomainError):
    """Базовое исключение для ошибок обработки корректно сформированной сущности."""

    category = ErrorCategoryEnum.UNPROCESSABLE
    code = "unprocessable"
    message = "Невозможно обработать запрос"


class RateLimitedError(BaseDomainError):
    """Базовое исключение для ошибок превышения лимита запросов."""

    category = ErrorCategoryEnum.RATE_LIMITED
    code = "rate_limited"
    message = "Превышен лимит запросов"


class UnavailableError(BaseDomainError):
    """
    Базовое исключение для временного сбоя зависимости: сеть, таймаут, перегрузка, 5xx или троттлинг.

    Повтор позже может помочь, поэтому политика повторов настраивается на этот класс, а не на
    исключения отдельных адаптеров. Постоянный сбой зависимости — наследник `InternalError`.
    """

    category = ErrorCategoryEnum.UNAVAILABLE
    code = "unavailable"
    message = "Сервис временно недоступен"


class InternalError(BaseDomainError):
    """Базовое исключение для внутренних ошибок сервера."""

    category = ErrorCategoryEnum.INTERNAL
    code = "internal"
    message = "Внутренняя ошибка сервера"
