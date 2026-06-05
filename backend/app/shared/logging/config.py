import logging
import sys

import structlog

from app.shared.utils.json_serializer import serialize_to_json


def configure_logging(include_debug: bool = False) -> None:
    """
    Настройка логирования с использованием structlog и интеграцией со stdlib.

    Использует упрощенный подход на основе ProcessorFormatter:
    - structlog рендерит свои логи в JSON
    - ProcessorFormatter преобразует логи от стандартного logging (uvicorn и т.д.) в JSON

    Основано на документации structlog:
    https://www.structlog.org/en/stable/standard-library.html#rendering-using-structlog-based-formatters-within-logging

    """
    log_level = logging.DEBUG if include_debug else logging.INFO

    # Общие процессоры для всех типов логов
    shared_processors = [
        # Добавляет переменные контекста из contextvars (request_id, user_id и т.д.)
        # Эти переменные устанавливаются в middleware/dependencies и автоматически добавляются ко всем логам
        structlog.contextvars.merge_contextvars,
        # Добавляет уровень логирования (info, warning, error и т.д.) в поле "level"
        structlog.stdlib.add_log_level,
        # Добавляет имя логгера (например, "app.shared.middleware.exception_logging") в поле "logger"
        structlog.stdlib.add_logger_name,
        # Добавляет временную метку в ISO формате (например, "2026-01-03T15:51:20.104096Z") в поле "timestamp"
        structlog.processors.TimeStamper(fmt="iso"),
        # Добавляет информацию о стеке вызовов при наличии (для отладки)
        structlog.processors.StackInfoRenderer(),
        # Форматирует информацию об исключениях (traceback) в читаемый вид при наличии exc_info
        structlog.processors.format_exc_info,
    ]

    # Создаем форматтер для стандартного logging
    # ProcessorFormatter нужен для:
    # 1. Structlog логов - они используют wrap_for_formatter и распространяются в root logger
    # 2. Логов от других библиотек, использующих стандартный logging (если появятся)
    # Примечание: uvicorn.error отключен, но uvicorn может логировать критические ошибки
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,  # Процессоры для логов от stdlib
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(serializer=serialize_to_json),
        ],
    )

    # Настройка стандартного logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
        force=True,  # Перезаписываем существующую конфигурацию
    )

    # Очищаем все существующие handlers у root_logger
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(log_level)

    # Создаем один handler для root_logger
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(fmt=formatter)
    root_logger.addHandler(hdlr=handler)

    # Отключаем логирование uvicorn.error
    # Все ошибки приложения логируются через HTTPLoggingMiddleware
    uvicorn_error_logger = logging.getLogger("uvicorn.error")
    uvicorn_error_logger.handlers.clear()  # Удаляем все handlers
    uvicorn_error_logger.setLevel(logging.CRITICAL)  # Устанавливаем высокий уровень, чтобы ничего не логировалось
    uvicorn_error_logger.propagate = False  # Отключаем распространение в root logger. Логи не попадут в наш форматтер

    # Настройка structlog
    # Используем wrap_for_formatter для работы с ProcessorFormatter
    # Логи structlog будут распространяться в root logger (propagate=True по умолчанию)
    # который уже настроен с ProcessorFormatter
    structlog.configure(
        processors=[
            *shared_processors,
            # wrap_for_formatter преобразует event dict в формат для ProcessorFormatter
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
        context_class=dict,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """
    Получает настроенный логгер structlog.

    Args:
        name: Имя логгера (обычно __name__ модуля). Если None, используется имя вызывающего модуля.

    Returns:
        Настроенный BoundLogger с поддержкой структурированного логирования.

    Example:
        logger = get_logger(__name__)
        logger.info("User created", user_id=123)
    """
    return structlog.get_logger(name)
