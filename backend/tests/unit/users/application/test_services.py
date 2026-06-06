import datetime as dt
from uuid import uuid4

from app.users.application.schemas import CreateUserCommand
from app.users.application.services import UserService
from tests.fakes import FakeUserRepository, FakeUserUnitOfWork


async def test_create_user_inserts_mapped_entity(
    user_service: UserService,
    fake_user_repository: FakeUserRepository,
) -> None:
    """`create_user` кладёт в репозиторий entity с полями из команды."""
    command = CreateUserCommand(
        user_id=uuid4(),
        username="alice",
        email="alice@example.com",
        marketing_emails_consent=True,
        terms_accepted_at=dt.datetime(2026, 1, 1, tzinfo=dt.UTC),
    )

    await user_service.create_user(user=command)

    stored = fake_user_repository.by_user_id[command.user_id]
    assert stored.username == command.username
    assert stored.email == command.email
    assert stored.marketing_emails_consent == command.marketing_emails_consent
    assert stored.terms_accepted_at == command.terms_accepted_at


async def test_create_user_commits_once(
    user_service: UserService,
    fake_user_uow: FakeUserUnitOfWork,
) -> None:
    """`create_user` фиксирует транзакцию ровно один раз."""
    command = CreateUserCommand(
        user_id=uuid4(),
        username="alice",
        email="alice@example.com",
        marketing_emails_consent=True,
        terms_accepted_at=dt.datetime(2026, 1, 1, tzinfo=dt.UTC),
    )

    await user_service.create_user(user=command)

    fake_user_uow.commit_mock.assert_awaited_once()
