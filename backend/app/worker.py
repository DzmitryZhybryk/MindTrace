"""
Worker entrypoint для procrastinate-задач.

Поднимает только те компоненты, которые нужны исполнителю tasks:
``ResendComponent`` (даёт ``EmailTransportPort``) и ``ProcrastinateComponent``
(App + подключённые blueprint'ы доменов). ``SqlAlchemyComponent`` намеренно
отсутствует — текущая task ``send_verification_email`` БД не трогает,
рендерит письмо и зовёт provider.

Schema procrastinate применяется здесь же при старте: API схему не трогает,
в проде она придёт через alembic-миграцию (отдельная задача — см. план).

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


async def _ensure_procrastinate_schema(procrastinate_app: ProcrastinateApp) -> None:
    """
    Применяет procrastinate-схему, если её ещё нет.

    ``apply_schema_async()`` не идемпотентен: schema.sql использует
    ``CREATE TABLE`` без ``IF NOT EXISTS``, повторный вызов на уже
    мигрированной БД упадёт на дублирующих CREATE TABLE. Проверяем
    наличие ключевой таблицы ``procrastinate_jobs`` через ``to_regclass``
    и применяем схему только если её нет.

    Args:
        procrastinate_app: Открытый ``ProcrastinateApp`` (после ``open_async``)
    """
    result = await procrastinate_app.connector.execute_query_one_async(
        "SELECT to_regclass('public.procrastinate_jobs') AS table_oid",
    )
    if result["table_oid"] is None:
        await procrastinate_app.schema_manager.apply_schema_async()
        logger.info("worker.schema.applied")
    else:
        logger.info("worker.schema.already_applied")


async def run_worker() -> None:  # pragma: no cover — entry-point обвязка (компоненты+run), не unit-тестируется
    """Поднимает компоненты, применяет schema и запускает procrastinate-worker."""
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
        await _ensure_procrastinate_schema(procrastinate_app=procrastinate_app)
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
