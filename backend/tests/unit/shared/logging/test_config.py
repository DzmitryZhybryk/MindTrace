"""
Unit-тесты ``configure_logging`` — настройки stdlib-logging + structlog.

Проверяют уровень root-logger'а (INFO / DEBUG), единственный handler и приглушение
``uvicorn.error`` (все ошибки идут через ``HTTPLoggingMiddleware``). Глобальное состояние
восстанавливается фикстурой ``restore_logging``.
"""

import logging

from app.shared.logging.config import configure_logging


def test_configure_logging_sets_info_level_and_single_handler(restore_logging: None) -> None:
    """По умолчанию root-logger на INFO с единственным handler'ом."""
    configure_logging()

    root_logger = logging.getLogger()
    assert root_logger.level == logging.INFO
    assert len(root_logger.handlers) == 1


def test_configure_logging_debug_enables_debug_level(restore_logging: None) -> None:
    """``include_debug=True`` поднимает root-logger на DEBUG."""
    configure_logging(include_debug=True)

    assert logging.getLogger().level == logging.DEBUG


def test_configure_logging_silences_uvicorn_error_logger(restore_logging: None) -> None:
    """``uvicorn.error`` приглушён и не распространяется в root (ошибки логирует middleware)."""
    configure_logging()

    uvicorn_error_logger = logging.getLogger("uvicorn.error")
    assert uvicorn_error_logger.level == logging.CRITICAL
    assert uvicorn_error_logger.propagate is False
