"""
Маппинг доменных категорий ошибок в HTTP-статус.

Это HTTP-транспортный адаптер: единственное место, где доменная `ErrorCategory`
превращается в HTTP-код. Логика резолва вынесена в `resolve_http_status`, чтобы
её переиспользовали и HTTP-handler, и логирование, без дублирования. Для другого
транспорта (gRPC и т.п.) заводится отдельный аналогичный маппинг.

Модуль намеренно не импортирует FastAPI: им пользуется в том числе слой логирования.
"""

from app.shared.exceptions.base import BaseDomainError, ErrorCategory

# Категория не найдена в маппинге / исключение не доменное — отдаём 500.
_DEFAULT_HTTP_STATUS = 500

_CATEGORY_HTTP_STATUS: dict[ErrorCategory, int] = {
    ErrorCategory.INVALID_INPUT: 400,
    ErrorCategory.UNAUTHENTICATED: 401,
    ErrorCategory.PERMISSION_DENIED: 403,
    ErrorCategory.NOT_FOUND: 404,
    ErrorCategory.CONFLICT: 409,
    ErrorCategory.GONE: 410,
    ErrorCategory.UNPROCESSABLE: 422,
    ErrorCategory.RATE_LIMITED: 429,
    ErrorCategory.INTERNAL: 500,
}


def resolve_http_status(exc: Exception) -> int:
    """
    Возвращает HTTP-статус для исключения по его доменной категории.

    Args:
        exc: Исключение. Не-доменные исключения трактуются как внутренняя ошибка.

    Returns:
        HTTP статус-код (по умолчанию 500).
    """
    if isinstance(exc, BaseDomainError):
        return _CATEGORY_HTTP_STATUS.get(exc.category, _DEFAULT_HTTP_STATUS)

    return _DEFAULT_HTTP_STATUS
