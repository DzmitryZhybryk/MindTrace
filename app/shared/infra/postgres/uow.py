from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession


class BaseUnitOfWork:
    """
    Базовый Unit Of Work поверх SA-сессии.

    Async context manager: ``__aenter__`` открывает транзакцию (``session.begin()``),
    ``__aexit__`` rollback'ит на exception и закрывает сессию. Commit явный —
    caller вызывает ``await uow.commit()`` сам (например, после успешного
    atomic defer procrastinate-таски через ``TaskBus.bind_to(uow.session)``).

    Доменные UoW наследуются и добавляют репозитории как ``@property`` lazy-init.
    """

    def __init__(self, session: AsyncSession):
        self._session = session

    async def __aenter__(self) -> Self:
        await self._session.begin()
        return self

    async def __aexit__(self, exc_type: type, exc_val: BaseException, exc_tb: BaseException) -> None:
        if exc_type:
            await self._session.rollback()

        await self._session.close()

    @property
    def session(self) -> AsyncSession:
        """
        Доступ к async-сессии для интеграций, требующих raw-сессии.

        Главный потребитель — ``SessionBoundTaskBus`` (atomic defer
        procrastinate-таски в той же транзакции, что и pending writes).
        Не использовать в обычной бизнес-логике — все DB-операции должны
        идти через репозитории.
        """
        return self._session

    async def rollback(self) -> None:
        await self._session.rollback()

    async def commit(self) -> None:
        await self._session.commit()
