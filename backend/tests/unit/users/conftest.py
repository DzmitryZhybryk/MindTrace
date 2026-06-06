"""
Фикстуры домена users: фейк I/O-границы + собранный на нём ``UserService``.

Репозиторий выставлен отдельной фикстурой (тот же инстанс попадает и в
``FakeUserUnitOfWork``, и в тест) — так тест проверяет состояние хранилища напрямую.
"""

import pytest

from app.users.application.services import UserService
from tests.fakes import FakeUserRepository, FakeUserUnitOfWork


@pytest.fixture
def fake_user_repository() -> FakeUserRepository:
    return FakeUserRepository()


@pytest.fixture
def fake_user_uow(fake_user_repository: FakeUserRepository) -> FakeUserUnitOfWork:
    return FakeUserUnitOfWork(user_repository=fake_user_repository)


@pytest.fixture
def user_service(fake_user_uow: FakeUserUnitOfWork) -> UserService:
    return UserService(uow=fake_user_uow)
