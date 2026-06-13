"""
Юнит-тест адаптера ``InternalUsersClient`` (auth → users).

Реальный ``UserService`` на фейковых UoW/репозитории; фейкаем только I/O-границу users.
Тест пиннит маппинг ``create_user(...)`` → ``CreateUserCommand`` (``from_attributes=True``):
рассинхрон имён полей между ``CreateUserRequest`` (auth) и ``CreateUserCommand`` (users) тут
бы и всплыл — ни один другой тест этого не ловит.
"""

import datetime as dt
from uuid import uuid4

from app.auth.infra.clients.internal_users_client import InternalUsersClient
from app.users.application.services import UserService
from tests.fakes import FakeUserRepository, FakeUserUnitOfWork


async def test_create_user_maps_fields_and_persists_via_user_service() -> None:
    """create_user маппит поля в users-команду и кладёт пользователя через UserService (commit — за вызывающим)."""
    user_repository = FakeUserRepository()
    uow = FakeUserUnitOfWork(user_repository=user_repository)
    client = InternalUsersClient(user_service=UserService(uow=uow))

    user_id = uuid4()
    terms_accepted_at = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)

    await client.create_user(
        user_id=user_id,
        username="newuser",
        email="new@example.com",
        marketing_emails_consent=True,
        terms_accepted_at=terms_accepted_at,
    )

    stored = user_repository.by_user_id[user_id]
    assert stored.username == "newuser"
    assert stored.email == "new@example.com"
    assert stored.marketing_emails_consent is True
    assert stored.terms_accepted_at == terms_accepted_at
    uow.commit_mock.assert_not_awaited()
