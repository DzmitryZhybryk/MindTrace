"""
Шина задач procrastinate для application-слоя.

Расщеплена на два класса по зависимостям:

- ``TaskBus`` — операции defer'а вне транзакции (fire-and-forget). Принимает
  только ``ProcrastinateApp``; никакой сессии. Для atomic defer'а в текущей
  SA-транзакции используется ``TaskBus.bind_to(session) -> SessionBoundTaskBus``.
- ``SessionBoundTaskBus`` — view, привязанный к ``AsyncSession``. Все defer'ы
  выполняются через raw psycopg-connection сессии — попадают в ту же транзакцию,
  что и pending writes. Commit'ит ``UnitOfWork``.

Расширение:

- метод не нужна сессия → в ``TaskBus`` (``defer_at``, ``defer_periodic``);
- методу нужна активная SA-tx → в ``SessionBoundTaskBus``.

Зависимость зашита в типе — каждый новый метод попадает в правильный класс
без обсуждений.
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.infra.procrastinate.component import ProcrastinateApp


class TaskBus:
    """Фасад procrastinate без сессии. Defer'ы выполняются как fire-and-forget."""

    def __init__(self, *, app: ProcrastinateApp) -> None:
        self._app = app

    async def defer(self, *, task: Any, lock: str | None = None, **task_kwargs: Any) -> None:
        """
        Defer задачи вне транзакции.

        Args:
            task: Procrastinate Task (объект с ``.configure().defer_async()``)
            lock: Lock-строка procrastinate (одновременно может выполняться только
                один job с таким lock'ом). ``None`` — без lock'а.
            **task_kwargs: Аргументы, которые получит task на исполнении.
        """
        await task.configure(lock=lock).defer_async(**task_kwargs)

    def bind_to(self, session: AsyncSession) -> SessionBoundTaskBus:
        """
        Возвращает view, привязанный к активной SA-сессии.

        Все defer'ы через возвращённый объект выполняются в той же транзакции,
        что и pending writes сессии. Используется в сервисах:

            await self._task_bus.bind_to(uow.session).defer(task=..., **kwargs)
            await uow.commit()  # один commit фиксирует и writes, и procrastinate-job

        Args:
            session: Активная async-сессия SQLAlchemy.

        Returns:
            ``SessionBoundTaskBus``, в котором ``defer(...)`` атомарен с сессией.
        """
        return SessionBoundTaskBus(session=session)


class SessionBoundTaskBus:
    """
    TaskBus, привязанный к активной SA-сессии. Все операции выполняются через
    raw psycopg-connection сессии — попадают в ту же транзакцию, что и pending
    writes. Commit'ит ``UnitOfWork``.

    SA-сессия с psycopg3-драйвером оборачивает raw psycopg.AsyncConnection в
    ``AsyncAdapt_psycopg_connection``; raw-объект достаётся через
    ``get_raw_connection().driver_connection`` и передаётся в
    ``Task.configure(connection=...)``.
    """

    def __init__(self, *, session: AsyncSession) -> None:
        self._session = session

    async def defer(self, *, task: Any, lock: str | None = None, **task_kwargs: Any) -> None:
        """
        Атомарно ставит procrastinate-таску в той же транзакции, что и pending writes.

        Без commit'а — caller отвечает за фиксацию через ``UnitOfWork.commit()``.

        Args:
            task: Procrastinate Task (объект с ``.configure().defer_async()``)
            lock: Lock-строка procrastinate (одновременно может выполняться только
                один job с таким lock'ом). ``None`` — без lock'а.
            **task_kwargs: Аргументы, которые получит task на исполнении.
        """
        sa_connection = await self._session.connection()
        raw_connection = await sa_connection.get_raw_connection()
        await task.configure(
            connection=raw_connection.driver_connection,
            lock=lock,
        ).defer_async(**task_kwargs)
