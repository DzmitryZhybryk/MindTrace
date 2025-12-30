from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.infra.components.base import BaseComponent
from app.infra.components.registry import ResourceRegistry
from app.settings import Settings


class SessionMaker(async_sessionmaker[AsyncSession]):
    pass


class SqlAlchemyComponent(BaseComponent):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._engine = create_async_engine(settings.postgres_dsn, **settings.engine_kwargs)
        self._session_maker = SessionMaker(self._engine, **settings.sessionmaker_kwargs)

    async def startup(self, registry: ResourceRegistry) -> None:
        registry.set(SessionMaker, self._session_maker)

    async def shutdown(self) -> None:
        await self._engine.dispose()

    async def healthcheck(self) -> None:
        async with self._session_maker() as session:
            await session.execute(select(1))

    async def startcheck(self) -> None:
        await self.healthcheck()
