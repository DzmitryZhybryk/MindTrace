"""Middleware для логирования HTTP запросов и исключений."""

import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.shared.logging.classify import get_log_level_for_exception
from app.shared.logging.config import get_logger
from app.shared.logging.context import (
    build_error_log_context,
    build_log_context,
    extract_request_context,
    get_handled_error,
)
from app.shared.logging.events import get_event_name
from app.shared.types import DictStrAny

logger = get_logger(__name__)


class HTTPLoggingMiddleware(BaseHTTPMiddleware):
    """
    Unified middleware для логирования HTTP запросов и исключений.

    Заменяет стандартное логирование uvicorn.access и позволяет
    обогащать логи дополнительными данными (user_id и т.д.).
    Также перехватывает необработанные исключения на уровне ASGI и логирует их
    в нужном формате. Доменные исключения сюда не доходят как exception: их раньше
    конвертирует ExceptionMiddleware, а обработчик оставляет исключение на запросе,
    чтобы запись в логе шла по нему, а не по одному статусу ответа.
    """

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        """
        Обрабатывает запрос, логирует его и перехватывает исключения.

        Scenarios:
            - каждый HTTP-запрос
        """
        start_time = time.perf_counter()

        request_context = extract_request_context(request)

        try:
            response = await call_next(request)
        except Exception as exc:
            _log_exception(
                request=request,
                exc=exc,
                process_time=time.perf_counter() - start_time,
                context=request_context,
            )
            raise

        process_time = time.perf_counter() - start_time

        handled_error = get_handled_error(request)
        if handled_error is not None:
            _log_exception(request=request, exc=handled_error, process_time=process_time, context=request_context)
            return response

        log_context = build_log_context(
            request=request,
            status_code=response.status_code,
            process_time=process_time,
            context=request_context,
        )

        event = get_event_name(request)

        match response.status_code:
            case status if status >= 500:
                logger.error(event=event, **log_context)
            case status if status >= 400:
                logger.warning(event=event, **log_context)
            case _:
                logger.info(event=event, **log_context)

        return response


def _log_exception(*, request: Request, exc: Exception, process_time: float, context: DictStrAny) -> None:
    log_context, _, include_traceback = build_error_log_context(
        request=request,
        exc=exc,
        process_time=process_time,
        context=context,
    )

    logger.log(
        get_log_level_for_exception(exc),
        get_event_name(request),
        exc_info=exc if include_traceback else None,
        **log_context,
    )
