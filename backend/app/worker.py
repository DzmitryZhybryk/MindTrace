"""
Worker entrypoint для procrastinate-задач.

Поднимает только те компоненты, которые нужны исполнителю tasks:
``ResendComponent`` (даёт ``EmailTransportPort``) и ``ProcrastinateComponent``
(App + подключённые blueprint'ы доменов). ``SqlAlchemyComponent`` намеренно
отсутствует — текущая task ``send_verification_email`` БД не трогает,
рендерит письмо и зовёт provider.

Schema procrastinate worker не трогает: её применяет шаг миграции
(``python -m app.shared.infra.procrastinate`` после ``alembic upgrade head``).

Процесс блокируется в ``run_worker_async`` до SIGTERM/SIGINT; procrastinate
сам graceful-shutdown'ит in-flight jobs, после чего освобождаем ресурсы
компонентов (psycopg-пул, httpx-пул) в обратном порядке.
"""

import asyncio

from app.auth.infra import auth_blueprint
from app.shared.enums import AppEnvEnum
from app.shared.infra.di.base import BaseComponent
from app.shared.infra.di.registry import ComponentRegistry
from app.shared.infra.email import EmailTransportPort, ResendComponent
from app.shared.infra.procrastinate import ProcrastinateApp, ProcrastinateComponent
from app.shared.logging import configure_logging, get_logger
from app.shared.settings import settings

logger = get_logger(__name__)


async def run_worker() -> None:  # pragma: no cover — entry-point обвязка (компоненты+run), не unit-тестируется
    """Поднимает компоненты и запускает procrastinate-worker."""
    configure_logging(include_debug=settings.ENVIRONMENT in (AppEnvEnum.LOCAL, AppEnvEnum.DEVELOPMENT))

    registry = ComponentRegistry()
    components: list[BaseComponent] = [
        ResendComponent(settings=settings),
        ProcrastinateComponent(settings=settings, blueprints=[auth_blueprint]),
    ]
    for component in components:
        await component.startup(registry)

    procrastinate_app = registry.get(ProcrastinateApp)
    email_transport = registry.get(EmailTransportPort)

    try:
        logger.info("worker.starting", concurrency=settings.PROCRASTINATE_WORKER_CONCURRENCY)
        await procrastinate_app.run_worker_async(
            concurrency=settings.PROCRASTINATE_WORKER_CONCURRENCY,
            additional_context={"email_transport": email_transport},
        )
    finally:
        for component in reversed(components):
            await component.shutdown()


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(run_worker())
