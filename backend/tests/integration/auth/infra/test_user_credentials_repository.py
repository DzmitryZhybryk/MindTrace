"""
Интеграционные тесты ``UserCredentialsRepository`` против реального Postgres.

Покрывают round-trip entity↔БД, OR-выборку по email/username и реальные
unique-констрейнты (``email`` и ``username``), которые на фейках не проверить.
"""

import datetime as dt
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.domain.enums import UserRole
from app.auth.infra.repositories import UserCredentialsRepository
from tests.builders import make_user_credentials

_VERIFIED_AT = dt.datetime(2026, 6, 1, tzinfo=dt.UTC)


async def test_insert_then_find_by_user_id_roundtrip(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """insert + commit → ``find_user_credentials_by_user_id`` возвращает ту же сущность."""
    user_id = uuid4()
    user_credentials_entity = make_user_credentials(
        user_id=user_id, email="uc-roundtrip@example.com", username="uc_roundtrip"
    )
    async with session_factory() as writer:
        await UserCredentialsRepository(session=writer).insert_user_credentials(
            user_credentials_entity=user_credentials_entity
        )
        await writer.commit()

    async with session_factory() as reader:
        found = await UserCredentialsRepository(session=reader).find_user_credentials_by_user_id(user_id=user_id)

    assert found is not None
    assert found.user_id == user_id
    assert found.email == "uc-roundtrip@example.com"
    assert found.username == "uc_roundtrip"
    assert found.password.hash == user_credentials_entity.password.hash
    assert found.role is UserRole.FREE
    assert found.email_verified_at is None


async def test_find_by_email_or_username_returns_matching_rows(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """OR-выборка ловит конфликт и по email, и по username одним запросом (0..2 строки)."""
    user_one = uuid4()
    user_two = uuid4()
    credentials_one = make_user_credentials(user_id=user_one, email="first@example.com", username="first_user")
    credentials_two = make_user_credentials(user_id=user_two, email="second@example.com", username="second_user")
    async with session_factory() as writer:
        repository = UserCredentialsRepository(session=writer)
        await repository.insert_user_credentials(user_credentials_entity=credentials_one)
        await repository.insert_user_credentials(user_credentials_entity=credentials_two)
        await writer.commit()

    async with session_factory() as reader:
        found = await UserCredentialsRepository(session=reader).find_user_credentials_by_email_or_username(
            email="first@example.com",
            username="second_user",
        )

    assert {item.user_id for item in found} == {user_one, user_two}


async def test_find_by_email_or_username_no_match_returns_empty(
    db_session: AsyncSession,
) -> None:
    """OR-выборка без совпадений возвращает пустой список, а не падает."""
    found = await UserCredentialsRepository(session=db_session).find_user_credentials_by_email_or_username(
        email="nobody@example.com",
        username="nobody",
    )

    assert found == []


async def test_insert_duplicate_email_raises_integrity_error(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Повторный email нарушает unique-констрейнт — ``IntegrityError`` на commit."""
    existing = make_user_credentials(email="dup@example.com", username="original_user")
    async with session_factory() as writer:
        await UserCredentialsRepository(session=writer).insert_user_credentials(user_credentials_entity=existing)
        await writer.commit()

    duplicate = make_user_credentials(email="dup@example.com", username="another_user")
    async with session_factory() as writer:
        await UserCredentialsRepository(session=writer).insert_user_credentials(user_credentials_entity=duplicate)
        with pytest.raises(IntegrityError):
            await writer.commit()


async def test_insert_duplicate_username_raises_integrity_error(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Повторный username нарушает unique-констрейнт — ``IntegrityError`` на commit."""
    existing = make_user_credentials(email="original@example.com", username="dup_user")
    async with session_factory() as writer:
        await UserCredentialsRepository(session=writer).insert_user_credentials(user_credentials_entity=existing)
        await writer.commit()

    duplicate = make_user_credentials(email="another@example.com", username="dup_user")
    async with session_factory() as writer:
        await UserCredentialsRepository(session=writer).insert_user_credentials(user_credentials_entity=duplicate)
        with pytest.raises(IntegrityError):
            await writer.commit()


async def test_update_persists_email_verified_at(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """``update_user_credentials_by_user_id`` персистит ``email_verified_at`` (виден из новой сессии)."""
    user_id = uuid4()
    user_credentials_entity = make_user_credentials(
        user_id=user_id, email="uc-update@example.com", username="uc_update"
    )
    async with session_factory() as writer:
        await UserCredentialsRepository(session=writer).insert_user_credentials(
            user_credentials_entity=user_credentials_entity
        )
        await writer.commit()

    verified = make_user_credentials(
        user_id=user_id,
        email="uc-update@example.com",
        username="uc_update",
        email_verified_at=_VERIFIED_AT,
    )
    async with session_factory() as writer:
        await UserCredentialsRepository(session=writer).update_user_credentials_by_user_id(
            user_credentials_entity=verified
        )
        await writer.commit()

    async with session_factory() as reader:
        found = await UserCredentialsRepository(session=reader).find_user_credentials_by_user_id(user_id=user_id)

    assert found is not None
    assert found.email_verified_at == _VERIFIED_AT
