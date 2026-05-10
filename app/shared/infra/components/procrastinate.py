"""
Procrastinate App + Component.

App создаётся внутри компонента; module-level singleton'а нет — это снимает
зависимость shared/ от глобального settings и от конкретных доменных tasks.

Domain-tasks объявляются через локальные ``Blueprint``-инстансы в каждом
домене (``app/<domain>/infra/tasks.py``). Composition root собирает blueprints
и передаёт их в ``ProcrastinateComponent``; внутри ``add_tasks_from`` копирует
декларации в App.

Драйвер psycopg3 (async) выбран сознательно: позволяет atomic defer
из той же SQLAlchemy-сессии (``await session.connection()`` → передача в
``defer_async(connection=...)``).
"""

from typing import Any

from procrastinate import App, Blueprint, PsycopgConnector
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.infra.components.base import BaseComponent
from app.shared.infra.components.registry import ComponentRegistry
from app.shared.settings import ProcrastinateSettings


class ProcrastinateApp(App):
    """Typed alias для использования как ключ в ComponentRegistry."""


class ProcrastinateComponent(BaseComponent):
    def __init__(
        self,
        *,
        settings: ProcrastinateSettings,
        blueprints: list[Blueprint] | None = None,
    ) -> None:
        """
        Создаёт App-инстанс и регистрирует blueprints.

        Args:
            settings: Procrastinate-конфиг (pool/worker) + унаследованный PG DSN.
            blueprints: Доменные blueprint'ы с декларациями tasks. None/пустой —
                компонент поднимается без tasks (валидно для сервисов, которые
                только defer'ят чужие tasks или используют App как outbox-relay).
        """
        self._app = ProcrastinateApp(
            connector=PsycopgConnector(
                conninfo=settings.procrastinate_dsn,
                min_size=settings.PROCRASTINATE_POOL_MIN_SIZE,
                max_size=settings.PROCRASTINATE_POOL_MAX_SIZE,
            ),
        )

        for blueprint in blueprints or []:
            self._app.add_tasks_from(blueprint, namespace="")

    async def startup(self, registry: ComponentRegistry) -> None:
        await self._app.open_async()
        registry.set(ProcrastinateApp, self._app)

    async def shutdown(self) -> None:
        await self._app.close_async()


async def defer_in_session(
    *,
    session: AsyncSession,
    task: Any,
    lock: str | None = None,
    **task_kwargs: Any,
) -> None:
    """
    Атомарно ставит procrastinate-таску в той же транзакции, что и pending writes сессии.

    SA-сессия с psycopg3-драйвером оборачивает raw psycopg.AsyncConnection в
    ``AsyncAdapt_psycopg_connection``; raw-объект достаётся через
    ``get_raw_connection().driver_connection`` и передаётся в
    ``Task.configure(connection=...)``. Без commit'а — caller отвечает за
    фиксацию через ``UnitOfWork.commit()``.

    Args:
        session: Активная async-сессия SQLAlchemy
        task: Procrastinate Task (объект с ``.configure().defer_async()``)
        lock: Lock-строка procrastinate (одновременно может выполняться только
            один job с таким lock'ом). ``None`` — без lock'а.
        **task_kwargs: Аргументы, которые получит task на исполнении

    Returns:
        None
    """
    sa_connection = await session.connection()
    raw_connection = await sa_connection.get_raw_connection()
    await task.configure(
        connection=raw_connection.driver_connection,
        lock=lock,
    ).defer_async(**task_kwargs)
