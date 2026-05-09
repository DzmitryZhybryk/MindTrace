"""Базовые исключения для доменов."""

from app.shared.types import OptionalDict


class BaseDomainError(Exception):
    """
    Базовое исключение для всех доменных ошибок.

    Все доменные исключения должны наследоваться от этого класса.
    Дочерние классы могут задать атрибуты класса `code` и `message` для дефолтных значений.
    Поле `details` несёт машинно-читаемую метаинформацию для клиента
    (например, ``{"field": "email"}`` для подсветки конкретного поля формы).
    """

    code: str = "unknown_error"
    message: str = "Произошла ошибка"
    details: OptionalDict = None

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
            details = self.details

        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


class BadRequestError(BaseDomainError):
    """Базовое исключение для ошибок валидации и некорректных запросов (HTTP 400)."""

    code = "bad_request"
    message = "Некорректный запрос"


class UnauthorizedError(BaseDomainError):
    """Базовое исключение для ошибок авторизации (HTTP 401)."""

    code = "unauthorized"
    message = "Требуется авторизация"


class ForbiddenError(BaseDomainError):
    """Базовое исключение для ошибок доступа (HTTP 403)."""

    code = "forbidden"
    message = "Доступ запрещен"


class NotFoundError(BaseDomainError):
    """Базовое исключение для ошибок "ресурс не найден" (HTTP 404)."""

    code = "not_found"
    message = "Ресурс не найден"


class ConflictError(BaseDomainError):
    """Базовое исключение для конфликтов данных (HTTP 409)."""

    code = "conflict"
    message = "Конфликт данных"


class GoneError(BaseDomainError):
    """Базовое исключение для ресурсов, которые когда-то были и истекли (HTTP 410)."""

    code = "gone"
    message = "Ресурс больше недоступен"


class UnprocessableEntityError(BaseDomainError):
    """Базовое исключение для ошибок обработки сущности (HTTP 422)."""

    code = "unprocessable_entity"
    message = "Невозможно обработать запрос"


class TooManyRequestsError(BaseDomainError):
    """Базовое исключение для ошибок превышения лимита запросов (HTTP 429)."""

    code = "too_many_requests"
    message = "Превышен лимит запросов"


class ServerError(BaseDomainError):
    """Базовое исключение для внутренних ошибок сервера (HTTP 500)."""

    code = "internal_server_error"
    message = "Внутренняя ошибка сервера"
