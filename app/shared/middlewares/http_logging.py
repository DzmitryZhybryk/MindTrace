"""Middleware для логирования HTTP запросов и исключений."""

from __future__ import annotations

import logging
import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.shared.exceptions import BaseDomainError
from app.shared.utils import (
    build_error_log_context,
    build_log_context,
    extract_request_context,
    get_event_name,
    get_log_level_for_exception,
    get_logger,
)

logger = get_logger(__name__)


class HTTPLoggingMiddleware(BaseHTTPMiddleware):
    """
    Unified middleware для логирования HTTP запросов и исключений.

    Заменяет стандартное логирование uvicorn.access и позволяет
    обогащать логи дополнительными данными (user_id и т.д.).
    Также перехватывает исключения на уровне ASGI и логирует их
    в нужном формате, помечая в request.state для фильтрации uvicorn.
    """

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        """Обрабатывает запрос, логирует его и перехватывает исключения."""
        # Засекаем время начала обработки
        start_time = time.perf_counter()

        # Извлекаем базовый контекст из запроса
        request_context = extract_request_context(request)

        try:
            # Выполняем запрос
            response = await call_next(request)
        except Exception as exc:
            # Вычисляем время обработки
            process_time = time.perf_counter() - start_time

            # Формируем контекст для логирования ошибки
            log_context, _, include_traceback = build_error_log_context(
                request=request,
                exc=exc,
                process_time=process_time,
                context=request_context,
            )

            # Определяем уровень логирования по типу исключения
            log_level = get_log_level_for_exception(exc)

            # Помечаем исключение в request.state для фильтра uvicorn
            if isinstance(exc, BaseDomainError):
                request.state.exception_handled = True
                request.state.exception_type = type(exc)
            else:
                request.state.exception_handled = False

            # Получаем семантическое название события
            event = get_event_name(request.method, request.url.path)

            # Логируем с соответствующим уровнем
            if log_level == logging.ERROR:
                logger.exception(
                    event=event,
                    exc_info=exc if include_traceback else None,
                    **log_context,
                )
            elif log_level == logging.WARNING:
                logger.warning(event=event, **log_context)
            else:
                logger.info(event=event, **log_context)

            # Пробрасываем исключение дальше для обработки FastAPI
            raise
        else:
            # Вычисляем время обработки
            process_time = time.perf_counter() - start_time

            # Формируем полный контекст для логирования успешного запроса
            log_context = build_log_context(
                request=request,
                status_code=response.status_code,
                process_time=process_time,
                context=request_context,
            )

            # Получаем семантическое название события и логируем запрос
            event = get_event_name(request.method, request.url.path)
            logger.info(event=event, **log_context)

            return response
