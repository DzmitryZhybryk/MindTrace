"""CLI применения procrastinate-схемы: ``python -m app.shared.infra.procrastinate``."""

import asyncio

from app.shared.enums import AppEnvEnum
from app.shared.infra.di.registry import ComponentRegistry
from app.shared.infra.procrastinate.component import ProcrastinateApp, ProcrastinateComponent
from app.shared.infra.procrastinate.schema import ensure_procrastinate_schema
from app.shared.logging import configure_logging
from app.shared.settings import settings


async def main() -> None:
    """Применяет procrastinate-схему, если её ещё нет в базе."""
    configure_logging(include_debug=settings.ENVIRONMENT in (AppEnvEnum.LOCAL, AppEnvEnum.DEVELOPMENT))

    registry = ComponentRegistry()
    component = ProcrastinateComponent(settings=settings, blueprints=[])
    await component.startup(registry)
    try:
        await ensure_procrastinate_schema(procrastinate_app=registry.get(ProcrastinateApp))
    finally:
        await component.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
