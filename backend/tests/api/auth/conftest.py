"""
Auth-данные для generic api-проводки (``tests/api/conftest.py``).

Здесь только то, чьё определение **импортирует auth**: фейк auth-UoW с репозиториями, фейк
исходящего клиента к users (порт домена auth), auth-настройки email-верификации и три
data-фикстуры, которыми generic-фикстура ``app`` собирает приложение — ``router`` (auth-роутер),
``router_prefix`` (``/v1/auth``) и ``dependency_overrides`` (какие листовые auth-deps чем
подменить). Сам механизм сборки ``app``, ``client``, фейки shared-инфры (salted/deterministic
hasher, task-bus) и ``mint_access_token`` живут в родительском ``tests/api/conftest.py``.

Подменяем лишь **листовые** dependency — UoW, users-client, salted-hasher, task-bus,
email-настройки. Реальными остаются ``auth_service``/``email_verification_service``/
``token_issuer``/``current_user_id`` (они эти листья и компонуют) — так тест прогоняет
настоящую проводку сервисов, выпуск/декод JWT, куки и exception-handler'ы, фейкая только
ввод-вывод. ``task_bus_dependency`` обязателен в overrides: боевой читает
``request.app.registry.get(ProcrastinateTaskBus)``, а ``api_app`` поднят без компонентов —
registry пуст и боевой бы упал.

Сборка тут **другая**, чем в ``tests/unit/auth/conftest.py`` (unit кладёт фейки в конструктор
``AuthService``; api — в ``dependency_overrides``), поэтому фикстуры самодостаточны и
переиспользуют лишь **классы** фейков из ``tests/fakes/``; строгий fixture-reuse с unit —
follow-up.
"""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi import APIRouter

from app.auth import auth_router
from app.auth.application.settings import EmailVerificationSettings
from app.auth.presentation.dependencies import (
    auth_uow_dependency,
    email_verification_settings_dependency,
    salted_hasher_dependency,
    task_bus_dependency,
    users_client_dependency,
)
from tests.fakes import (
    FakeAuthUnitOfWork,
    FakeChallengeRepository,
    FakeRefreshTokenRepository,
    FakeSaltedHasher,
    FakeTaskBus,
    FakeUserCredentialsRepository,
    FakeUsersClient,
)

_AUTH_ROUTER_PREFIX = "/v1/auth"
_EMAIL_VERIFICATION_TTL_MINUTES = 15
_EMAIL_VERIFICATION_MAX_ATTEMPTS = 5
_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60


@pytest.fixture
def fake_user_credentials_repository() -> FakeUserCredentialsRepository:
    return FakeUserCredentialsRepository()


@pytest.fixture
def fake_refresh_token_repository() -> FakeRefreshTokenRepository:
    return FakeRefreshTokenRepository()


@pytest.fixture
def fake_challenge_repository() -> FakeChallengeRepository:
    return FakeChallengeRepository()


@pytest.fixture
def fake_uow(
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
    fake_challenge_repository: FakeChallengeRepository,
) -> FakeAuthUnitOfWork:
    # Репозитории — отдельные фикстуры тех же инстансов: тест сидит/ассертит их состояние
    # по конкретному типу (на uow они под port-типом, без .by_user_id/.challenges).
    return FakeAuthUnitOfWork(
        user_credentials_repository=fake_user_credentials_repository,
        refresh_token_repository=fake_refresh_token_repository,
        challenge_repository=fake_challenge_repository,
    )


@pytest.fixture
def fake_users_client() -> FakeUsersClient:
    return FakeUsersClient()


@pytest.fixture
def email_verification_settings() -> EmailVerificationSettings:
    return EmailVerificationSettings(
        email_verification_ttl_minutes=_EMAIL_VERIFICATION_TTL_MINUTES,
        email_verification_max_attempts=_EMAIL_VERIFICATION_MAX_ATTEMPTS,
        email_verification_resend_cooldown_seconds=_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    )


@pytest.fixture
def router() -> APIRouter:
    return auth_router


@pytest.fixture
def router_prefix() -> str:
    return _AUTH_ROUTER_PREFIX


@pytest.fixture
def dependency_overrides(
    fake_uow: FakeAuthUnitOfWork,
    fake_users_client: FakeUsersClient,
    fake_salted_hasher: FakeSaltedHasher,
    fake_task_bus: FakeTaskBus,
    email_verification_settings: EmailVerificationSettings,
) -> dict[Callable[..., Any], Callable[..., Any]]:
    return {
        auth_uow_dependency: lambda: fake_uow,
        users_client_dependency: lambda: fake_users_client,
        salted_hasher_dependency: lambda: fake_salted_hasher,
        task_bus_dependency: lambda: fake_task_bus,
        email_verification_settings_dependency: lambda: email_verification_settings,
    }
