"""
Фикстуры домена auth: фейки I/O-границы + собранные на них application-сервисы.

Сборка сервисов держится здесь, чтобы тесты не повторяли проводку. Репозитории
выставлены отдельными фикстурами (тот же инстанс попадает и в ``FakeAuthUnitOfWork``,
и в тест) — так тест проверяет состояние хранилища напрямую. ``TokenIssuer`` и
``JWTService`` — реальные (stateless infra, дешёвые и детерминированные).
"""

import pytest

from app.auth.application.auth_service import AuthService
from app.auth.application.email_verification_service import EmailVerificationService
from app.auth.application.settings import EmailVerificationSettings
from app.auth.application.token_issuer import TokenIssuer
from app.shared.infra.crypto import Sha256DeterministicHasher
from app.shared.infra.jwt import JWTService
from tests.fakes import (
    FakeAuthUnitOfWork,
    FakeChallengeRepository,
    FakeEmailVerificationService,
    FakeRefreshTokenRepository,
    FakeSaltedHasher,
    FakeTaskBus,
    FakeUserCredentialsRepository,
    FakeUsersClient,
)

_REFRESH_TOKEN_TTL_DAYS = 30
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
    return FakeAuthUnitOfWork(
        user_credentials_repository=fake_user_credentials_repository,
        refresh_token_repository=fake_refresh_token_repository,
        challenge_repository=fake_challenge_repository,
    )


@pytest.fixture
def fake_salted_hasher() -> FakeSaltedHasher:
    return FakeSaltedHasher()


@pytest.fixture
def deterministic_hasher() -> Sha256DeterministicHasher:
    return Sha256DeterministicHasher()


@pytest.fixture
def token_issuer(deterministic_hasher: Sha256DeterministicHasher, jwt_service: JWTService) -> TokenIssuer:
    return TokenIssuer(
        deterministic_hasher=deterministic_hasher,
        jwt_service=jwt_service,
        refresh_token_ttl_days=_REFRESH_TOKEN_TTL_DAYS,
    )


@pytest.fixture
def fake_task_bus() -> FakeTaskBus:
    return FakeTaskBus()


@pytest.fixture
def fake_users_client() -> FakeUsersClient:
    return FakeUsersClient()


@pytest.fixture
def fake_email_verification_service() -> FakeEmailVerificationService:
    return FakeEmailVerificationService()


@pytest.fixture
def email_verification_settings() -> EmailVerificationSettings:
    return EmailVerificationSettings(
        email_verification_ttl_minutes=_EMAIL_VERIFICATION_TTL_MINUTES,
        email_verification_max_attempts=_EMAIL_VERIFICATION_MAX_ATTEMPTS,
        email_verification_resend_cooldown_seconds=_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    )


@pytest.fixture
def auth_service(
    fake_uow: FakeAuthUnitOfWork,
    fake_users_client: FakeUsersClient,
    fake_salted_hasher: FakeSaltedHasher,
    token_issuer: TokenIssuer,
    fake_email_verification_service: FakeEmailVerificationService,
) -> AuthService:
    return AuthService(
        uow=fake_uow,
        users_client=fake_users_client,
        salted_hasher=fake_salted_hasher,
        token_issuer=token_issuer,
        email_verification_service=fake_email_verification_service,
    )


@pytest.fixture
def email_verification_service(
    fake_uow: FakeAuthUnitOfWork,
    fake_salted_hasher: FakeSaltedHasher,
    fake_task_bus: FakeTaskBus,
    email_verification_settings: EmailVerificationSettings,
) -> EmailVerificationService:
    return EmailVerificationService(
        uow=fake_uow,
        salted_hasher=fake_salted_hasher,
        task_bus=fake_task_bus,
        email_verification_settings=email_verification_settings,
    )
