"""
Интеграционные тесты ``AuthUnitOfWork`` против реального Postgres.

Проверяют транзакционную модель (Option A) на живой сессии — то, что фейк UoW
(``commit = AsyncMock``) проверить не может: ``commit()`` внутри ``transaction()``
делает запись видимой другим сессиям, а выход без commit'а / исключение —
откатывают (rollback-by-default).
"""

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.infra.repositories import RefreshTokenRepository, UserCredentialsRepository
from app.auth.infra.uow import AuthUnitOfWork
from tests.builders import make_refresh_token, make_user_credentials


async def test_transaction_commit_persists_across_sessions(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """``commit()`` внутри ``transaction()`` фиксирует запись — она видна из новой сессии."""
    user_id = uuid4()
    user_credentials_entity = make_user_credentials(
        user_id=user_id, email="uow-commit@example.com", username="uow_commit"
    )
    async with session_factory() as session:
        uow = AuthUnitOfWork(session=session)
        async with uow.transaction():
            await uow.user_credentials_repository.insert_user_credentials(
                user_credentials_entity=user_credentials_entity
            )
            await uow.commit()

    async with session_factory() as reader:
        found = await UserCredentialsRepository(session=reader).find_user_credentials_by_user_id(user_id=user_id)

    assert found is not None
    assert found.user_id == user_id


async def test_transaction_without_commit_rolls_back(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Выход из ``transaction()`` без ``commit()`` откатывает запись — новая сессия её не видит."""
    user_id = uuid4()
    user_credentials_entity = make_user_credentials(
        user_id=user_id, email="uow-nocommit@example.com", username="uow_nocommit"
    )
    async with session_factory() as session:
        uow = AuthUnitOfWork(session=session)
        async with uow.transaction():
            await uow.user_credentials_repository.insert_user_credentials(
                user_credentials_entity=user_credentials_entity
            )
            # commit() намеренно не вызываем → выход из transaction() откатывает

    async with session_factory() as reader:
        found = await UserCredentialsRepository(session=reader).find_user_credentials_by_user_id(user_id=user_id)

    assert found is None


async def test_exception_in_transaction_rolls_back(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Исключение внутри ``transaction()`` пробрасывается и откатывает незакоммиченную запись."""
    user_id = uuid4()
    user_credentials_entity = make_user_credentials(
        user_id=user_id, email="uow-error@example.com", username="uow_error"
    )
    async with session_factory() as session:
        uow = AuthUnitOfWork(session=session)
        # PT012: блок намеренно составной — проверяем, что исключение проходит сквозь
        # transaction() (и откатывает), поэтому raise обязан быть внутри async with.
        with pytest.raises(RuntimeError, match="boom"):  # noqa: PT012
            async with uow.transaction():
                await uow.user_credentials_repository.insert_user_credentials(
                    user_credentials_entity=user_credentials_entity
                )
                raise RuntimeError("boom")

    async with session_factory() as reader:
        found = await UserCredentialsRepository(session=reader).find_user_credentials_by_user_id(user_id=user_id)

    assert found is None


async def test_session_property_returns_underlying_session(db_session: AsyncSession) -> None:
    """``session``-property отдаёт ту же сессию — шов для atomic-defer (``task_bus.bind_to(uow.session)``)."""
    uow = AuthUnitOfWork(session=db_session)

    assert uow.session is db_session


async def test_transaction_flush_orders_credentials_before_dependent_refresh_token(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """
    Явный ``flush()`` после родителя пускает зависимый ``refresh_token`` в ту же tx без FK-ошибки.

    Регресс на ordering вставок: ``register`` кладёт обе записи в одну транзакцию, где
    ``refresh_tokens.user_id`` → ``user_credentials.user_id`` (FK). Порядок INSERT'ов
    между разными мапперами в одном flush SQLAlchemy не гарантирует — без вмешательства
    ``INSERT refresh_tokens`` мог уйти первым и поймать ``ForeignKeyViolation``. Фикс —
    явный ``uow.flush()`` после вставки родителя: его INSERT материализуется в БД до
    зависимой строки. Воспроизводится только на реальном Postgres с FK-констрейнтом —
    фейки и раздельный сид это не покрывают.
    """
    user_id = uuid4()
    user_credentials_entity = make_user_credentials(
        user_id=user_id, email="uow-fk-order@example.com", username="uow_fk_order"
    )
    refresh_token_entity = make_refresh_token(user_id=user_id, token_hash="uow-fk-order-refresh_token_entity-hash")
    async with session_factory() as session:
        uow = AuthUnitOfWork(session=session)
        async with uow.transaction():
            await uow.user_credentials_repository.insert_user_credentials(
                user_credentials_entity=user_credentials_entity
            )
            await uow.flush()  # родитель уходит в БД до зависимого refresh_token
            await uow.refresh_token_repository.insert_refresh_token(refresh_token_entity=refresh_token_entity)
            await uow.commit()

    async with session_factory() as reader:
        found_credentials = await UserCredentialsRepository(session=reader).find_user_credentials_by_user_id(
            user_id=user_id,
        )
        found_token = await RefreshTokenRepository(session=reader).find_refresh_token_by_hash_for_update(
            token_hash="uow-fk-order-refresh_token_entity-hash",
        )

    assert found_credentials is not None
    assert found_token is not None
    assert found_token.user_id == user_id
