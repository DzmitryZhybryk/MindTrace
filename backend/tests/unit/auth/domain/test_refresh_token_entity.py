import datetime as dt

from tests.builders import make_refresh_token


def test_is_expired_true_when_expires_in_past() -> None:
    """`is_expired` истинно, когда срок действия в прошлом."""
    token = make_refresh_token(expires_at=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=1))
    assert token.is_expired


def test_is_expired_false_when_expires_in_future() -> None:
    """`is_expired` ложно, когда срок действия в будущем."""
    token = make_refresh_token(expires_at=dt.datetime.now(tz=dt.UTC) + dt.timedelta(days=1))
    assert not token.is_expired


def test_is_revoked_reflects_revoked_at() -> None:
    """`is_revoked` отражает наличие `revoked_at`."""
    active = make_refresh_token(revoked_at=None)
    revoked = make_refresh_token(revoked_at=dt.datetime.now(tz=dt.UTC))
    assert not active.is_revoked
    assert revoked.is_revoked


def test_revoke_sets_revoked_at_and_marks_updated() -> None:
    """`revoke()` ставит `revoked_at` и обновляет `updated_at`."""
    token = make_refresh_token(revoked_at=None, updated_at=None)

    token.revoke()

    assert token.is_revoked
    assert token.revoked_at is not None
    assert token.updated_at is not None


def test_revoke_is_idempotent() -> None:
    """Повторный `revoke()` на отозванном токене не перезаписывает timestamp."""
    revoked_at = dt.datetime.now(tz=dt.UTC) - dt.timedelta(hours=1)
    token = make_refresh_token(revoked_at=revoked_at)

    token.revoke()

    assert token.revoked_at == revoked_at
