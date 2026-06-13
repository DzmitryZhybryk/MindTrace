from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession


class BaseUnitOfWork:
    """
    Базовый Unit Of Work поверх SA-сессии — тонкий транзакционный фасад.

    Жизненным циклом сессии владеет ``db_session_dependency``
    (``async with sessionmaker() as session``): он открывает сессию на запрос и
    закрывает её на выходе. UoW сессию НЕ открывает и НЕ закрывает — он лишь
    группирует репозитории и задаёт транзакционную область.

    Транзакционная модель (Option A): один use-case = одна область
    ``async with uow.transaction():`` во владении входной точки use-case'а
    (например, ``AuthService.register``). Внутри области явный ``await uow.commit()``
    фиксирует изменения; cross-domain участники (``UserService.create_user``) не
    коммитят — их записи фиксируются тем же единственным commit'ом атомарно.

    Два уровня явности границы транзакции:
      * ``transaction()`` — ОБЛАСТЬ (видна по ``async with``-блоку и отступу).
        Выход без commit'а ИЛИ исключение → rollback всего незакоммиченного.
      * ``commit()`` — ДЕЙСТВИЕ (явная фиксация «транзакция завершена»).

    Доменные UoW наследуются и инициализируют репозитории в ``__init__``.
    """

    def __init__(self, session: AsyncSession):
        self._session = session

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        """
        Явная транзакционная область поверх request-scoped сессии.

        Внутри блока вызывается ``await uow.commit()`` — явная фиксация. Выход из
        блока без commit'а ИЛИ исключение → ``rollback`` (всё незакоммиченное
        откатывается); после успешного commit'а ``rollback`` на выходе — no-op
        (зафиксированное уже не отменить). Сессию НЕ создаёт и НЕ закрывает —
        её lifecycle за ``db_session_dependency``.
        """
        try:
            yield
        finally:
            await self._session.rollback()

    @property
    def session(self) -> AsyncSession:
        """
        Доступ к async-сессии для интеграций, требующих raw-сессии.

        Главный потребитель — ``SessionBoundTaskBusPort`` (atomic defer
        procrastinate-таски в той же транзакции, что и pending writes).
        Не использовать в обычной бизнес-логике — все DB-операции должны
        идти через репозитории.
        """
        return self._session

    async def commit(self) -> None:
        await self._session.commit()
