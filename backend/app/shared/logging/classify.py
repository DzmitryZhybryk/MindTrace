"""Классификация исключений для логирования: HTTP-статус и log-level."""

import logging

from app.shared.exceptions import BaseDomainError, ErrorCategoryEnum
from app.shared.exceptions.mappings import resolve_http_status


def get_status_code_from_exception(exc: Exception) -> int:
    """
    Определяет HTTP статус код на основе типа исключения.

    Делегирует единому HTTP-резолву (`resolve_http_status`), чтобы статус в логах
    совпадал со статусом HTTP-ответа.

    Scenarios:
        - лог HTTP-запроса, завершившегося исключением

    Args:
        exc: Исключение

    Returns:
        HTTP статус код
    """
    return resolve_http_status(exc)


def get_log_level_for_exception(exc: Exception) -> int:
    """
    Определяет уровень логирования на основе типа исключения.

    Ошибка клиента и временная недоступность зависимости — warning: первая не сбой сервера, за
    второй следят по доле 503. Внутренняя ошибка и необработанное исключение — error.

    Scenarios:
        - лог HTTP-запроса, завершившегося исключением

    Args:
        exc: Исключение

    Returns:
        Уровень логирования (logging.ERROR, logging.WARNING и т.д.)
    """
    if isinstance(exc, BaseDomainError):
        if exc.category is ErrorCategoryEnum.INTERNAL:
            return logging.ERROR

        return logging.WARNING

    return logging.ERROR
