"""Классификация исключений для логирования: HTTP-статус и log-level."""

import logging

from app.shared.exceptions import BaseDomainError, ErrorCategory
from app.shared.exceptions.mappings import resolve_http_status


def get_status_code_from_exception(exc: Exception) -> int:
    """
    Определяет HTTP статус код на основе типа исключения.

    Делегирует единому HTTP-резолву (`resolve_http_status`), чтобы статус в логах
    совпадал со статусом HTTP-ответа.

    Args:
        exc: Исключение

    Returns:
        HTTP статус код
    """
    return resolve_http_status(exc)


def get_log_level_for_exception(exc: Exception) -> int:
    """
    Определяет уровень логирования на основе типа исключения.

    Args:
        exc: Исключение

    Returns:
        Уровень логирования (logging.ERROR, logging.WARNING и т.д.)
    """
    if isinstance(exc, BaseDomainError):
        if exc.category is ErrorCategory.INTERNAL:
            # Внутренние ошибки - error
            return logging.ERROR
        # Клиентские ошибки - warning
        return logging.WARNING

    # Необработанные исключения - error
    return logging.ERROR
