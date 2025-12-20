from sqlalchemy import select

# from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import (
    # AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# from sqlalchemy.pool import NullPool
from app.infra.components.base import BaseComponent

# from service_lib.infrastructure.logging import LoggerMixin
from app.infra.components.registry import ResourceRegistry
from app.settings import Settings


class SessionMaker(async_sessionmaker[AsyncSession]):
    pass


class SqlAlchemyComponent(BaseComponent):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._engine = create_async_engine(settings.POSTGRES_DSN, **settings.engine_kwargs)
        self._session_maker = SessionMaker(self._engine, **settings.sessionmaker_kwargs)

    async def startup(self, registry: ResourceRegistry) -> None:
        # await self.test_on_fail_fast_connection()
        registry.set(SessionMaker, self._session_maker)

    async def shutdown(self) -> None:
        await self._engine.dispose()

    async def healthcheck(self) -> None:
        async with self._session_maker() as session:
            await session.execute(select(1))

    async def startcheck(self) -> None:
        await self.healthcheck()

    # async def test_on_fail_fast_connection(self) -> None:
    #     # Create a temporary engine WITHOUT a connection pool for reliable checking
    #     temp_engine = create_async_engine(
    #         self._settings.sqlalchemy_dsn,
    #         poolclass=NullPool,
    #         isolation_level=self._settings.sqlalchemy_isolation_level,
    #         connect_args={
    #             "timeout": self._settings.sqlalchemy_connection_timeout,
    #             "command_timeout": self._settings.sqlalchemy_command_timeout,
    #         },
    #     )
    #     try:
    #         await asyncio.wait_for(
    #             self._test_connection(temp_engine),
    #             timeout=self._settings.sqlalchemy_connection_timeout + 2,
    #         )
    #         self.logger.info("PostgreSQL connection successful.")

    #     except (OperationalError, TimeoutError, ConnectionRefusedError) as e:
    #         self.logger.error(f"Could not connect to PostgreSQL database: {e}")
    #         # It is important to release the connection pool before crashing
    #         await self._engine.dispose()
    #         raise RuntimeError("Failed to connect to PostgreSQL database") from e
    #     except Exception as e:
    #         self.logger.error(f"Unexpected error during PostgreSQL connection: {e}")
    #         raise RuntimeError("Failed to connect to PostgreSQL") from e
    #     finally:
    #         await temp_engine.dispose()

    # async def _test_connection(self, engine: AsyncEngine) -> None:
    #     async with engine.begin() as conn:
    #         await conn.execute(select(1))
