"""Утилиты для логирования HTTP запросов."""

from __future__ import annotations

import logging

from starlette.requests import Request

from app.shared.exceptions import BaseDomainError, ServerError
from app.shared.exceptions.mappings import DOMAIN_EXCEPTION_MAPPING
from app.shared.types import DictStrAny


def extract_request_context(request: Request) -> DictStrAny:
    """
    Извлекает базовый контекст из HTTP запроса.

    Args:
        request: HTTP запрос

    Returns:
        Словарь с базовым контекстом запроса
    """
    context: DictStrAny = {}

    # Извлекаем IP клиента
    if request.client:
        context["client_ip"] = request.client.host

    # Добавляем query параметры если есть
    if request.url.query:
        context["query_params"] = request.url.query

    # Пытаемся извлечь user_id из request.state (если установлен в других middleware/dependencies)
    if hasattr(request.state, "user_id"):
        context["user_id"] = str(request.state.user_id)

    # Можно добавить другие данные из request.state
    # Например, request_id, если он установлен
    if hasattr(request.state, "request_id"):
        context["request_id"] = str(request.state.request_id)

    return context


def build_log_context(
    request: Request,
    status_code: int,
    process_time: float,
    context: DictStrAny | None = None,
) -> DictStrAny:
    """
    Формирует полный контекст для логирования HTTP запроса.

    Args:
        request: HTTP запрос
        status_code: HTTP статус код ответа
        process_time: Время обработки запроса в секундах
        context: Дополнительный контекст (например, из extract_request_context)

    Returns:
        Полный контекст для логирования
    """
    log_context = {
        "method": request.method,
        "path": request.url.path,
        "status_code": status_code,
        "process_time": round(process_time, 4),
    }

    # Добавляем базовый контекст из request
    if context:
        log_context.update(context)
    else:
        log_context.update(extract_request_context(request))

    return log_context


def get_status_code_from_exception(exc: Exception) -> int:
    """
    Определяет HTTP статус код на основе типа исключения.

    Args:
        exc: Исключение

    Returns:
        HTTP статус код
    """
    exc_type = type(exc)

    # Ищем точное совпадение типа исключения
    if exc_type in DOMAIN_EXCEPTION_MAPPING:
        status_code, _ = DOMAIN_EXCEPTION_MAPPING[exc_type]
        return status_code

    # Ищем по базовому классу (для иерархии исключений)
    for exc_class, (code, _) in DOMAIN_EXCEPTION_MAPPING.items():
        if isinstance(exc, exc_class):
            return code

    # По умолчанию возвращаем 500
    return 500


def build_error_log_context(
    request: Request,
    exc: Exception,
    process_time: float,
    context: DictStrAny | None = None,
) -> tuple[DictStrAny, int, bool]:
    """
    Формирует контекст для логирования ошибки и определяет параметры логирования.

    Args:
        request: HTTP запрос
        exc: Исключение
        process_time: Время обработки запроса в секундах
        context: Дополнительный контекст (например, из extract_request_context)

    Returns:
        Tuple из (контекст логирования, статус код, нужно ли включать traceback)
    """
    status_code = get_status_code_from_exception(exc)

    # Формируем базовый контекст
    log_context = build_log_context(request, status_code, process_time, context)

    # Добавляем информацию об ошибке
    log_context["error_type"] = type(exc).__name__

    if isinstance(exc, BaseDomainError):
        log_context["error_code"] = exc.code
        log_context["error_message"] = exc.message
        include_traceback = False
    else:
        log_context["error_message"] = str(exc)
        include_traceback = True

    return log_context, status_code, include_traceback


def get_log_level_for_exception(exc: Exception) -> int:
    """
    Определяет уровень логирования на основе типа исключения.

    Args:
        exc: Исключение

    Returns:
        Уровень логирования (logging.ERROR, logging.WARNING и т.д.)
    """
    if isinstance(exc, BaseDomainError):
        if isinstance(exc, ServerError):
            # Серверные ошибки - error
            return logging.ERROR
        # Клиентские ошибки - warning
        return logging.WARNING
    # Необработанные исключения - error
    return logging.ERROR
