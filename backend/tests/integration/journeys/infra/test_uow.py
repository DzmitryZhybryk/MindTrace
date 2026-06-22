"""
Интеграционные тесты ``JourneyUnitOfWork`` против реального Postgres.

Проверяют транзакционную границу create-поездки на живой сессии — то, что фейк UoW
(``commit = AsyncMock``) проверить не может: ``commit()`` внутри ``transaction()`` фиксирует
вставку (видна из новой сессии), а выход без commit'а / исключение откатывают её
(rollback-by-default из ``BaseUnitOfWork``).
"""

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.journeys.infra.models import Journey
from app.journeys.infra.uow import JourneyUnitOfWork
from tests.builders import make_journey

_COUNT_JOURNEYS = sa.select(sa.func.count()).select_from(Journey)


async def test_transaction_commit_persists_journey(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """``commit()`` внутри ``transaction()`` фиксирует поездку — она видна из новой сессии."""
    journey = make_journey()
    async with session_factory() as session:
        uow = JourneyUnitOfWork(session=session)
        async with uow.transaction():
            await uow.journey_repository.insert_journey(journey=journey)
            await uow.commit()

    async with session_factory() as reader:
        count = (await reader.execute(_COUNT_JOURNEYS)).scalar_one()

    assert count == 1


async def test_transaction_without_commit_rolls_back(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Выход из ``transaction()`` без ``commit()`` откатывает вставку — новая сессия её не видит."""
    journey = make_journey()
    async with session_factory() as session:
        uow = JourneyUnitOfWork(session=session)
        async with uow.transaction():
            await uow.journey_repository.insert_journey(journey=journey)
            # commit() намеренно не вызываем → выход из transaction() откатывает

    async with session_factory() as reader:
        count = (await reader.execute(_COUNT_JOURNEYS)).scalar_one()

    assert count == 0


async def test_exception_in_transaction_rolls_back(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Исключение внутри ``transaction()`` пробрасывается и откатывает незакоммиченную вставку."""
    journey = make_journey()
    async with session_factory() as session:
        uow = JourneyUnitOfWork(session=session)
        # PT012: блок намеренно составной — проверяем, что исключение проходит сквозь
        # transaction() (и откатывает), поэтому raise обязан быть внутри async with.
        with pytest.raises(RuntimeError, match="boom"):  # noqa: PT012
            async with uow.transaction():
                await uow.journey_repository.insert_journey(journey=journey)
                raise RuntimeError("boom")

    async with session_factory() as reader:
        count = (await reader.execute(_COUNT_JOURNEYS)).scalar_one()

    assert count == 0
