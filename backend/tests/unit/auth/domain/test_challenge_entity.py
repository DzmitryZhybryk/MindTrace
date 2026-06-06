import datetime as dt

import pytest

from app.auth.domain.entities import ChallengeEntity
from app.auth.exceptions import (
    ChallengeAttemptsExceededError,
    ChallengeExpiredError,
    ChallengeResendCooldownError,
)
from tests.builders import make_challenge


def test_generate_code_is_six_digits() -> None:
    """`generate_code` возвращает строку из 6 цифр."""
    code = ChallengeEntity.generate_code()
    assert len(code) == 6
    assert code.isdigit()


def test_is_active_true_when_unused_and_not_expired() -> None:
    """`is_active` истинно для неиспользованного и не истёкшего challenge'а."""
    challenge = make_challenge(
        used_at=None,
        expires_at=dt.datetime.now(tz=dt.UTC) + dt.timedelta(minutes=10),
    )
    assert challenge.is_active()


def test_is_active_false_when_used() -> None:
    """`is_active` ложно для уже использованного challenge'а."""
    challenge = make_challenge(used_at=dt.datetime.now(tz=dt.UTC))
    assert not challenge.is_active()


def test_is_active_false_when_expired() -> None:
    """`is_active` ложно для истёкшего challenge'а."""
    challenge = make_challenge(expires_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=1))
    assert not challenge.is_active()


def test_ensure_resend_cooldown_passed_raises_within_cooldown() -> None:
    """Бросает, если cooldown на resend ещё не истёк."""
    challenge = make_challenge(created_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=10))
    with pytest.raises(ChallengeResendCooldownError):
        challenge.ensure_resend_cooldown_passed(cooldown_seconds=60)


def test_ensure_resend_cooldown_passed_ok_after_cooldown() -> None:
    """Молчит, когда cooldown на resend истёк."""
    challenge = make_challenge(created_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=120))
    challenge.ensure_resend_cooldown_passed(cooldown_seconds=60)


def test_ensure_can_attempt_raises_when_expired() -> None:
    """`ensure_can_attempt` бросает на истёкшем challenge'е."""
    challenge = make_challenge(expires_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=1))
    with pytest.raises(ChallengeExpiredError):
        challenge.ensure_can_attempt(max_attempts=5)


def test_ensure_can_attempt_raises_when_used() -> None:
    """`ensure_can_attempt` бросает на использованном challenge'е."""
    challenge = make_challenge(used_at=dt.datetime.now(tz=dt.UTC))
    with pytest.raises(ChallengeExpiredError):
        challenge.ensure_can_attempt(max_attempts=5)


def test_ensure_can_attempt_raises_when_attempts_exhausted() -> None:
    """`ensure_can_attempt` бросает при исчерпании попыток."""
    challenge = make_challenge(attempts=5)
    with pytest.raises(ChallengeAttemptsExceededError):
        challenge.ensure_can_attempt(max_attempts=5)


def test_ensure_can_attempt_ok_when_active_with_attempts_left() -> None:
    """`ensure_can_attempt` молчит, пока challenge активен и есть попытки."""
    challenge = make_challenge(attempts=2)
    challenge.ensure_can_attempt(max_attempts=5)


def test_register_failed_attempt_increments_and_marks_updated() -> None:
    """`register_failed_attempt` инкрементит счётчик и обновляет `updated_at`."""
    challenge = make_challenge(attempts=2, updated_at=None)

    challenge.register_failed_attempt()

    assert challenge.attempts == 3
    assert challenge.updated_at is not None


def test_mark_used_sets_used_at_and_marks_updated() -> None:
    """`mark_used` ставит `used_at` и обновляет `updated_at`."""
    challenge = make_challenge(used_at=None, updated_at=None)

    challenge.mark_used()

    assert challenge.used_at is not None
    assert challenge.updated_at is not None
