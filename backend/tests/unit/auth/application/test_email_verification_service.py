import datetime as dt
from uuid import uuid4

import pytest

from app.auth.application.email_verification_service import EmailVerificationService
from app.auth.application.task_names import SEND_VERIFICATION_EMAIL_TASK
from app.auth.domain.enums import ChallengeType
from app.auth.exceptions import (
    ChallengeAttemptsExceededError,
    ChallengeExpiredError,
    ChallengeNotFoundError,
    ChallengeResendCooldownError,
    EmailAlreadyVerifiedError,
    UserCredentialsNotFoundError,
    VerificationCodeInvalidError,
)
from tests.builders import make_challenge, make_user_credentials
from tests.fakes import (
    FakeAuthUnitOfWork,
    FakeChallengeRepository,
    FakeSaltedHasher,
    FakeTaskBus,
    FakeUserCredentialsRepository,
)

_VERIFICATION_CODE_LENGTH = 6


# --- request_email_verification --------------------------------------------


async def test_request_creates_challenge_and_defers_email_atomically(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_task_bus: FakeTaskBus,
    fake_salted_hasher: FakeSaltedHasher,
) -> None:
    """request: создаёт challenge, кладёт хеш кода (plaintext уходит в письмо), defer'ит в сессии UoW, коммитит."""
    user_credentials_entity = make_user_credentials(email="neo@example.com", email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)

    await email_verification_service.request_email_verification(user_id=user_credentials_entity.user_id)

    assert len(fake_challenge_repository.challenges) == 1
    challenge_entity = fake_challenge_repository.challenges[0]
    assert challenge_entity.user_id == user_credentials_entity.user_id
    assert challenge_entity.challenge_type is ChallengeType.EMAIL_VERIFICATION

    assert len(fake_task_bus.bound.deferred) == 1
    deferred = fake_task_bus.bound.deferred[0]
    assert deferred.task_name == SEND_VERIFICATION_EMAIL_TASK
    assert deferred.lock == f"email_verification:user:{user_credentials_entity.user_id}"
    assert deferred.kwargs["email"] == "neo@example.com"
    assert deferred.kwargs["user_id"] == str(user_credentials_entity.user_id)

    code = deferred.kwargs["code"]
    assert code.isdigit()
    assert len(code) == _VERIFICATION_CODE_LENGTH
    assert challenge_entity.code_hash == fake_salted_hasher.hash(secret=code)

    assert fake_task_bus.bound_session is fake_uow.session
    fake_uow.commit_mock.assert_awaited_once()


async def test_request_raises_when_user_not_found(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_challenge_repository: FakeChallengeRepository,
    fake_task_bus: FakeTaskBus,
) -> None:
    """request: нет учётной записи → UserCredentialsNotFoundError, без challenge, defer'а и коммита."""
    with pytest.raises(UserCredentialsNotFoundError):
        await email_verification_service.request_email_verification(user_id=uuid4())

    assert fake_challenge_repository.challenges == []
    assert fake_task_bus.bound.deferred == []
    fake_uow.commit_mock.assert_not_awaited()


async def test_request_raises_when_email_already_verified(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
) -> None:
    """request: email уже подтверждён → EmailAlreadyVerifiedError, без challenge и коммита."""
    user_credentials_entity = make_user_credentials(email_verified_at=dt.datetime.now(tz=dt.UTC))
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)

    with pytest.raises(EmailAlreadyVerifiedError):
        await email_verification_service.request_email_verification(user_id=user_credentials_entity.user_id)

    assert fake_challenge_repository.challenges == []
    fake_uow.commit_mock.assert_not_awaited()


async def test_request_raises_when_resend_cooldown_active(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
) -> None:
    """request: активный challenge свежее cooldown'а → ChallengeResendCooldownError, без нового challenge и коммита."""
    user_credentials_entity = make_user_credentials(email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)
    existing = make_challenge(
        user_id=user_credentials_entity.user_id,
        used_at=None,
        created_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=10),
    )
    await fake_challenge_repository.insert_challenge(challenge_entity=existing)

    with pytest.raises(ChallengeResendCooldownError):
        await email_verification_service.request_email_verification(user_id=user_credentials_entity.user_id)

    assert len(fake_challenge_repository.challenges) == 1
    assert existing.used_at is None
    fake_uow.commit_mock.assert_not_awaited()


async def test_request_supersedes_previous_challenge_after_cooldown(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
) -> None:
    """request: cooldown прошёл → старый challenge закрывается (used_at), создаётся новый активный, коммит."""
    user_credentials_entity = make_user_credentials(email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)
    previous = make_challenge(
        user_id=user_credentials_entity.user_id,
        used_at=None,
        created_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=120),
    )
    await fake_challenge_repository.insert_challenge(challenge_entity=previous)

    await email_verification_service.request_email_verification(user_id=user_credentials_entity.user_id)

    assert previous.used_at is not None
    assert len(fake_challenge_repository.challenges) == 2
    active = [c for c in fake_challenge_repository.challenges if c.used_at is None]
    assert len(active) == 1
    fake_uow.commit_mock.assert_awaited_once()


# --- verify_email -----------------------------------------------------------


async def test_verify_marks_email_verified_on_correct_code(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
) -> None:
    """verify: верный код помечает email подтверждённым, закрывает challenge, коммитит."""
    user_credentials_entity = make_user_credentials(email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)
    challenge_entity = make_challenge(
        user_id=user_credentials_entity.user_id,
        used_at=None,
        code_hash=fake_salted_hasher.hash(secret="123456"),
    )
    await fake_challenge_repository.insert_challenge(challenge_entity=challenge_entity)

    await email_verification_service.verify_email(user_id=user_credentials_entity.user_id, code="123456")

    assert user_credentials_entity.is_email_verified
    assert challenge_entity.used_at is not None
    fake_uow.commit_mock.assert_awaited_once()


async def test_verify_increments_attempts_and_raises_on_wrong_code(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
) -> None:
    """verify: неверный код инкрементит счётчик попыток, коммитит инкремент и бросает VerificationCodeInvalidError."""
    user_credentials_entity = make_user_credentials(email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)
    challenge_entity = make_challenge(
        user_id=user_credentials_entity.user_id,
        used_at=None,
        attempts=0,
        code_hash=fake_salted_hasher.hash(secret="123456"),
    )
    await fake_challenge_repository.insert_challenge(challenge_entity=challenge_entity)

    with pytest.raises(VerificationCodeInvalidError):
        await email_verification_service.verify_email(user_id=user_credentials_entity.user_id, code="000000")

    assert challenge_entity.attempts == 1
    assert not user_credentials_entity.is_email_verified
    fake_uow.commit_mock.assert_awaited_once()


async def test_verify_raises_when_user_not_found(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
) -> None:
    """verify: нет учётной записи → UserCredentialsNotFoundError, без коммита."""
    with pytest.raises(UserCredentialsNotFoundError):
        await email_verification_service.verify_email(user_id=uuid4(), code="123456")

    fake_uow.commit_mock.assert_not_awaited()


async def test_verify_raises_when_email_already_verified(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
) -> None:
    """verify: email уже подтверждён → EmailAlreadyVerifiedError, без коммита."""
    user_credentials_entity = make_user_credentials(email_verified_at=dt.datetime.now(tz=dt.UTC))
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)

    with pytest.raises(EmailAlreadyVerifiedError):
        await email_verification_service.verify_email(user_id=user_credentials_entity.user_id, code="123456")

    fake_uow.commit_mock.assert_not_awaited()


async def test_verify_raises_when_no_active_challenge(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
) -> None:
    """verify: у пользователя нет активного challenge'а → ChallengeNotFoundError, без коммита."""
    user_credentials_entity = make_user_credentials(email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)

    with pytest.raises(ChallengeNotFoundError):
        await email_verification_service.verify_email(user_id=user_credentials_entity.user_id, code="123456")

    fake_uow.commit_mock.assert_not_awaited()


async def test_verify_raises_when_attempts_exhausted(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
) -> None:
    """verify: лимит попыток исчерпан → ChallengeAttemptsExceededError ещё до сверки кода, без коммита."""
    user_credentials_entity = make_user_credentials(email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)
    challenge_entity = make_challenge(
        user_id=user_credentials_entity.user_id,
        used_at=None,
        attempts=5,
        code_hash=fake_salted_hasher.hash(secret="123456"),
    )
    await fake_challenge_repository.insert_challenge(challenge_entity=challenge_entity)

    with pytest.raises(ChallengeAttemptsExceededError):
        await email_verification_service.verify_email(user_id=user_credentials_entity.user_id, code="123456")

    fake_uow.commit_mock.assert_not_awaited()


async def test_verify_raises_when_challenge_expired(
    email_verification_service: EmailVerificationService,
    fake_uow: FakeAuthUnitOfWork,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
) -> None:
    """verify: срок действия challenge'а истёк → ChallengeExpiredError, без коммита."""
    user_credentials_entity = make_user_credentials(email_verified_at=None)
    await fake_user_credentials_repository.insert_user_credentials(user_credentials_entity=user_credentials_entity)
    challenge_entity = make_challenge(
        user_id=user_credentials_entity.user_id,
        used_at=None,
        expires_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=1),
        code_hash=fake_salted_hasher.hash(secret="123456"),
    )
    await fake_challenge_repository.insert_challenge(challenge_entity=challenge_entity)

    with pytest.raises(ChallengeExpiredError):
        await email_verification_service.verify_email(user_id=user_credentials_entity.user_id, code="123456")

    fake_uow.commit_mock.assert_not_awaited()
