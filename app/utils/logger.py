import logging
import sys

import orjson
import structlog


def configure_logging(is_debug: bool = False) -> None:
    """Настройка логирования с использованием structlog и интеграцией со stdlib."""
    level = logging.DEBUG if is_debug else logging.INFO

    def json_serializer(obj, **kwargs):
        # Простая сериализация в JSON с поддержкой кириллицы
        return orjson.dumps(obj).decode("utf-8")  # type: ignore[attr-defined]

    renderer = structlog.processors.JSONRenderer(serializer=json_serializer)

    # Процессоры для structlog (БЕЗ финального рендерера)
    # Рендеринг будет выполняться через ProcessorFormatter
    structlog_processors = [
        structlog.contextvars.merge_contextvars,  # request_id, user_id
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        # НЕ добавляем renderer здесь - он будет применен через ProcessorFormatter
    ]

    # Процессоры для стандартного logging (foreign logs)
    foreign_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    # Настройка стандартного logging с ProcessorFormatter
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
        force=True,  # Перезаписываем существующую конфигурацию
    )

    # Создаем форматтер для всех handlers
    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=foreign_processors,
    )

    # Настраиваем форматтер для root logger
    # Логи от structlog будут форматироваться через ProcessorFormatter
    # Логи от uvicorn останутся в стандартном формате (это нормально для access логов)
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        handler.setFormatter(formatter)
    root_logger.setLevel(level)

    # Настройка structlog для интеграции со stdlib
    # Процессоры structlog НЕ включают renderer - форматирование делает ProcessorFormatter
    structlog.configure(
        processors=[
            *structlog_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
        context_class=dict,
    )
