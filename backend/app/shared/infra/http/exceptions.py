"""
Исключения внешних HTTP API.

Адаптер только классифицирует сбой на временный и постоянный; что делать дальше — повторить задачу,
отдать 503 или перевести в ошибку своего домена — решает вызывающий. Статус апстрима в категорию не
переходит: его 404 для нашего клиента остаётся сбоем сервера.
"""

from app.shared.exceptions import BaseDomainError, InternalError, TemporaryError


class ExternalAPIError(BaseDomainError):
    """
    Сбой вызова внешнего HTTP API: метод, URL, статус и тело ответа для вызывающего и лога.

    Категорию, код и сообщение не задаёт: лист берёт их из категорийной базы, а этот класс держит
    контекст вызова и ловится тем, кому классификация не важна.
    """

    def __init__(
        self,
        *,
        method: str,
        url: str,
        status: int | None,
        message: str,
        body: object | None = None,
    ) -> None:
        super().__init__(message=message)
        self.method = method
        self.url = url
        self.status = status
        self.body = body


class ExternalAPITemporaryError(ExternalAPIError, TemporaryError):
    """Временный сбой внешнего API: 5xx, 429, 408, таймаут или сетевая ошибка."""


class ExternalAPIPersistentError(ExternalAPIError, InternalError):
    """Постоянный сбой внешнего API: остальные 4xx — повтор того же запроса не поможет."""

    code = "external_api_error"
