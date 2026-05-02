from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession


class BaseUnitOfWork:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def __aenter__(self) -> Self:
        await self._session.begin()
        return self

    async def __aexit__(self, exc_type: type, exc_val: BaseException, exc_tb: BaseException) -> None:
        if exc_type:
            await self._session.rollback()

        await self._session.close()

    async def rollback(self) -> None:
        await self._session.rollback()

    async def commit(self) -> None:
        await self._session.commit()
