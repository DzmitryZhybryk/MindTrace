"""Классификация исключений для логирования: HTTP-статус и log-level."""

import logging

from app.shared.exceptions import BaseDomainError, ServerError
from app.shared.exceptions.mappings import DOMAIN_EXCEPTION_MAPPING


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
