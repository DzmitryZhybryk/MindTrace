"""
Интеграционные тесты ``UserUnitOfWork`` против реального Postgres.

Проверяют транзакционную модель на живой сессии — то, что фейк UoW
(``commit = AsyncMock``) проверить не может: ``commit()`` внутри ``transaction()``
делает запись видимой другим сессиям, а выход без commit'а / исключение —
откатывают (rollback-by-default).
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.users.infra.repositories import UserRepository
from app.users.infra.uow import UserUnitOfWork
from tests.builders import make_user_entity


async def test_transaction_commit_persists_across_sessions(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """``commit()`` внутри ``transaction()`` фиксирует запись — она видна из новой сессии."""
    user_entity = make_user_entity()
    async with session_factory() as session:
        uow = UserUnitOfWork(session=session)
        async with uow.transaction():
            await uow.user_repository.insert_user(user_entity=user_entity)
            await uow.commit()

    async with session_factory() as reader:
        found = await UserRepository(session=reader).find_user_by_id(user_id=user_entity.user_id)

    assert found is not None


async def test_transaction_without_commit_rolls_back(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Выход из ``transaction()`` без ``commit()`` откатывает запись — новая сессия её не видит."""
    user_entity = make_user_entity()
    async with session_factory() as session:
        uow = UserUnitOfWork(session=session)
        async with uow.transaction():
            await uow.user_repository.insert_user(user_entity=user_entity)
            # commit() намеренно не вызываем → выход из transaction() откатывает

    async with session_factory() as reader:
        found = await UserRepository(session=reader).find_user_by_id(user_id=user_entity.user_id)

    assert found is None


async def test_exception_in_transaction_rolls_back(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Исключение внутри ``transaction()`` пробрасывается и откатывает незакоммиченную запись."""
    user_entity = make_user_entity()
    async with session_factory() as session:
        uow = UserUnitOfWork(session=session)
        # PT012: блок намеренно составной — проверяем, что исключение проходит сквозь
        # transaction() (и откатывает), поэтому raise обязан быть внутри async with.
        with pytest.raises(RuntimeError, match="boom"):  # noqa: PT012
            async with uow.transaction():
                await uow.user_repository.insert_user(user_entity=user_entity)
                raise RuntimeError("boom")

    async with session_factory() as reader:
        found = await UserRepository(session=reader).find_user_by_id(user_id=user_entity.user_id)

    assert found is None
