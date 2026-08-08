"""
Глобальные обработчики исключений для приложения.

Преобразуют доменные исключения в HTTP ответы, не привязываясь к конкретному
presentation фреймворку (FastAPI, gRPC и т.д.).
"""

from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.shared.exceptions import BaseDomainError
from app.shared.exceptions.mappings import resolve_http_status
from app.shared.exceptions.schemas import ErrorResponse
from app.shared.logging import get_logger

logger = get_logger(__name__)

type ExceptionHandlerT = Callable[[Request, Any], JSONResponse]

# Ответ на не-доменное / необработанное исключение: наружу не утекают детали внутренней ошибки.
_INTERNAL_ERROR_CONTENT = {"code": "internal", "message": "Внутренняя ошибка сервера"}


def _create_error_response(exc: BaseDomainError) -> JSONResponse:
    """Создает HTTP ответ для доменного исключения используя типизированную схему."""
    error_response = ErrorResponse(code=exc.code, message=exc.message, details=exc.details)
    return JSONResponse(
        status_code=resolve_http_status(exc),
        content=error_response.model_dump(mode="json"),
    )


def domain_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Обрабатывает доменные исключения, преобразуя их в HTTP ответы."""
    # Логирование выполняется в HTTPLoggingMiddleware. Handler зарегистрирован на
    # BaseDomainError, поэтому exc гарантированно доменный; HTTP-статус и тело берём
    # прямо из исключения через единый resolve_http_status.
    if isinstance(exc, BaseDomainError):
        return _create_error_response(exc)

    # Страховка на случай прямого вызова с не-доменным исключением.
    return JSONResponse(status_code=500, content=_INTERNAL_ERROR_CONTENT)


def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """
    Преобразует ошибки валидации FastAPI/pydantic (422) в единый ErrorResponse.

    По умолчанию FastAPI отдаёт 422 в формате ``{"detail": [...]}`` без поля
    ``code``, что ломает контракт ошибки на клиенте. Здесь 422 заворачивается в
    тот же envelope, что и доменные ошибки: ``code="validation_error"`` плюс
    ``details`` со списком проблемных полей (берём из ``loc``/``msg`` только
    строки, чтобы тело гарантированно сериализовалось в JSON).

    Args:
        request: HTTP-запрос (не используется, требуется сигнатурой handler'а)
        exc: Исключение валидации pydantic с детализацией по полям

    Returns:
        JSON-ответ 422 в формате ErrorResponse
    """
    fields = [
        {
            "field": ".".join(str(part) for part in error["loc"] if part != "body"),
            "reason": error["msg"],
        }
        for error in exc.errors()
    ]

    error_response = ErrorResponse(
        code="validation_error",
        message="Переданы некорректные данные",
        details={"fields": fields},
    )

    return JSONResponse(
        status_code=422,
        content=error_response.model_dump(mode="json"),
    )


def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Обрабатывает необработанные исключения (не-доменные → 500)."""
    # Страховка на случай прямого вызова с доменным исключением: через приложение
    # BaseDomainError уходит в свой domain_exception_handler и сюда не доходит.
    if isinstance(exc, BaseDomainError):
        return domain_exception_handler(request, exc)

    # Логирование выполняется в HTTPLoggingMiddleware.
    return JSONResponse(status_code=500, content=_INTERNAL_ERROR_CONTENT)


BASE_EXCEPTION_HANDLERS: dict[type[Exception], ExceptionHandlerT] = {
    # BaseDomainError регистрируем явно, чтобы Starlette положил handler в ExceptionMiddleware
    # (внутренний слой). Иначе он попадёт в ServerErrorMiddleware (внешний) и не вызовется
    # корректно из-за известной проблемы BaseHTTPMiddleware с пробрасыванием исключений.
    BaseDomainError: domain_exception_handler,
    # RequestValidationError перехватываем явно, иначе FastAPI вернёт дефолтный
    # 422 {"detail": [...]} без поля code — в обход нашего ErrorResponse-контракта.
    RequestValidationError: validation_exception_handler,
    Exception: global_exception_handler,
}


def register_exception_handlers(app: FastAPI) -> None:
    """
    Регистрирует обработчики исключений для FastAPI приложения.

    Args:
        app: Экземпляр FastAPI приложения
    """
    for exc_class, handler in BASE_EXCEPTION_HANDLERS.items():
        app.add_exception_handler(exc_class, handler)
