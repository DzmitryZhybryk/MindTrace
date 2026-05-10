"""
Глобальные обработчики исключений для приложения.

Преобразуют доменные исключения в HTTP ответы, не привязываясь к конкретному
presentation фреймворку (FastAPI, gRPC и т.д.).
"""

from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.shared.exceptions import BaseDomainError
from app.shared.exceptions.mappings import DOMAIN_EXCEPTION_MAPPING, ExceptionMappingT
from app.shared.exceptions.schemas import ErrorResponse
from app.shared.logging import get_logger
from app.shared.types import OptionalDict

logger = get_logger(__name__)

type ExceptionHandlerT = Callable[[Request, Any], JSONResponse]


def _create_error_response(
    status_code: int,
    exc: Exception,
    details: OptionalDict = None,
) -> JSONResponse:
    """Создает HTTP ответ для исключения используя типизированную схему."""
    if isinstance(exc, BaseDomainError):
        error_response = ErrorResponse(
            code=exc.code,
            message=exc.message,
            details=details if details is not None else exc.details,
        )
    else:
        error_response = ErrorResponse(
            code="internal_server_error",
            message=str(exc),
            details=details,
        )

    return JSONResponse(
        status_code=status_code,
        content=error_response.model_dump(mode="json"),
    )


def domain_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Обрабатывает доменные исключения, преобразуя их в HTTP ответы."""
    # Логирование выполняется в HTTPLoggingMiddleware
    # Ищем точное совпадение типа исключения
    exc_type = type(exc)
    if exc_type in DOMAIN_EXCEPTION_MAPPING:
        status_code, _ = DOMAIN_EXCEPTION_MAPPING[exc_type]
        return _create_error_response(status_code, exc)

    # Ищем по базовому классу (для иерархии исключений)
    for exc_class, (status_code, _) in DOMAIN_EXCEPTION_MAPPING.items():
        if isinstance(exc, exc_class):
            return _create_error_response(status_code, exc)

    # Если не найдено в маппинге, возвращаем общую ошибку
    return JSONResponse(
        status_code=500,
        content={"code": "internal_server_error", "message": "Внутренняя ошибка сервера"},
    )


def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Обрабатывает все необработанные исключения."""
    # Сначала пробуем обработать как доменное исключение
    if isinstance(exc, BaseDomainError):
        return domain_exception_handler(request, exc)

    # Логирование выполняется в HTTPLoggingMiddleware
    # Возвращаем общую ошибку
    return JSONResponse(
        status_code=500,
        content={"code": "internal_server_error", "message": "Внутренняя ошибка сервера"},
    )


BASE_EXCEPTION_HANDLERS: dict[type[Exception], ExceptionHandlerT] = {
    # BaseDomainError регистрируем явно, чтобы Starlette положил handler в ExceptionMiddleware
    # (внутренний слой). Иначе он попадёт в ServerErrorMiddleware (внешний) и не вызовется
    # корректно из-за известной проблемы BaseHTTPMiddleware с пробрасыванием исключений.
    BaseDomainError: domain_exception_handler,
    Exception: global_exception_handler,
}


def register_exception_handlers(
    app: FastAPI,
    *,
    handlers: dict[type[Exception], ExceptionHandlerT] | None = None,
    exception_mapping: ExceptionMappingT | None = None,
) -> None:
    """
    Регистрирует обработчики исключений для FastAPI приложения.

    Args:
        app: Экземпляр FastAPI приложения
        handlers: Дополнительные обработчики исключений (по умолчанию используется BASE_EXCEPTION_HANDLERS)
        exception_mapping: Дополнительный маппинг доменных исключений в HTTP ответы
    """
    if exception_mapping is not None:
        DOMAIN_EXCEPTION_MAPPING.update(exception_mapping)

    handlers_to_register = handlers or BASE_EXCEPTION_HANDLERS

    for exc_class, handler in handlers_to_register.items():
        app.add_exception_handler(exc_class, handler)
