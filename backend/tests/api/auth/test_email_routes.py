"""
api-тесты email-роутов (send-verification / verify) через ASGI без реальной БД.

Эти роуты защищены Bearer'ом: ``current_user_id_dependency`` — настоящий, токен выпускаем
``mint_access_token`` тем же ``get_jwt_service()``, которым приложение его и декодит. I/O
(UoW/репо, salted-hasher, task-bus) — фейки. Пиннят статусы и машинные ``code`` всей
матрицы доменных ошибок верификации.
"""

import datetime as dt
from collections.abc import Callable
from uuid import uuid4

from httpx import AsyncClient

from app.auth.application.settings import EmailVerificationSettings
from tests.builders import make_challenge, make_user_credentials
from tests.fakes import (
    FakeChallengeRepository,
    FakeSaltedHasher,
    FakeTaskBus,
    FakeUserCredentialsRepository,
)

_PAST = dt.datetime(2000, 1, 1, tzinfo=dt.UTC)
_SEND_VERIFICATION_URL = "/v1/auth/email/send-verification/"
_VERIFY_URL = "/v1/auth/email/verify/"


# --- send-verification -------------------------------------------------------


async def test_send_verification_returns_202_and_defers_email(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_task_bus: FakeTaskBus,
    mint_access_token: Callable[..., str],
) -> None:
    """send-verification для неподтверждённой учётки → 202, таска на письмо поставлена в очередь."""
    credentials = make_user_credentials()
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    token = mint_access_token(credentials.user_id)

    response = await client.post(_SEND_VERIFICATION_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 202
    assert len(fake_task_bus.bound.deferred) == 1


async def test_send_verification_without_bearer_returns_401(client: AsyncClient) -> None:
    """send-verification без Authorization → 401 auth.invalid_access_token."""
    response = await client.post(_SEND_VERIFICATION_URL)

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


async def test_send_verification_malformed_bearer_returns_401(client: AsyncClient) -> None:
    """send-verification с битым Bearer-токеном → 401 auth.invalid_access_token."""
    response = await client.post(_SEND_VERIFICATION_URL, headers={"Authorization": "Bearer not-a-jwt"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_access_token"


async def test_send_verification_unknown_user_returns_404(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """send-verification с токеном без учётки в БД → 404 auth.user_credentials_not_found."""
    token = mint_access_token(uuid4())

    response = await client.post(_SEND_VERIFICATION_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 404
    assert response.json()["code"] == "auth.user_credentials_not_found"


async def test_send_verification_already_verified_returns_409(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """send-verification для уже подтверждённого email → 409 auth.email_already_verified."""
    credentials = make_user_credentials(email_verified_at=_PAST)
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    token = mint_access_token(credentials.user_id)

    response = await client.post(_SEND_VERIFICATION_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 409
    assert response.json()["code"] == "auth.email_already_verified"


async def test_send_verification_within_cooldown_returns_429(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """send-verification при свежем активном challenge → 429 auth.challenge_resend_cooldown."""
    credentials = make_user_credentials()
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    fake_challenge_repository.challenges.append(make_challenge(user_id=credentials.user_id))
    token = mint_access_token(credentials.user_id)

    response = await client.post(_SEND_VERIFICATION_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 429
    assert response.json()["code"] == "auth.challenge_resend_cooldown"


# --- verify ------------------------------------------------------------------


async def test_verify_valid_code_returns_204_and_marks_verified(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
    mint_access_token: Callable[..., str],
) -> None:
    """verify с верным кодом → 204, email помечен подтверждённым, challenge использован."""
    code = "123456"
    credentials = make_user_credentials()
    challenge = make_challenge(user_id=credentials.user_id, code_hash=fake_salted_hasher.hash(code))
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    fake_challenge_repository.challenges.append(challenge)
    token = mint_access_token(credentials.user_id)

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": code},
    )

    assert response.status_code == 204
    assert credentials.is_email_verified
    assert challenge.used_at is not None


async def test_verify_wrong_code_returns_400_and_increments_attempts(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
    mint_access_token: Callable[..., str],
) -> None:
    """verify с неверным кодом → 400 auth.verification_code_invalid, счётчик попыток +1."""
    credentials = make_user_credentials()
    challenge = make_challenge(user_id=credentials.user_id, code_hash=fake_salted_hasher.hash("123456"))
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    fake_challenge_repository.challenges.append(challenge)
    token = mint_access_token(credentials.user_id)

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "000000"},
    )

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "auth.verification_code_invalid"
    assert body["details"] == {"field": "code"}
    assert challenge.attempts == 1


async def test_verify_unknown_user_returns_404(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """verify с токеном без учётки в БД → 404 auth.user_credentials_not_found."""
    token = mint_access_token(uuid4())

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "123456"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "auth.user_credentials_not_found"


async def test_verify_no_active_challenge_returns_404(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """verify без активного challenge → 404 auth.challenge_not_found."""
    credentials = make_user_credentials()
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    token = mint_access_token(credentials.user_id)

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "123456"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "auth.challenge_not_found"


async def test_verify_already_verified_returns_409(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    mint_access_token: Callable[..., str],
) -> None:
    """verify для уже подтверждённого email → 409 auth.email_already_verified."""
    credentials = make_user_credentials(email_verified_at=_PAST)
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    token = mint_access_token(credentials.user_id)

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "123456"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "auth.email_already_verified"


async def test_verify_expired_challenge_returns_410(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
    mint_access_token: Callable[..., str],
) -> None:
    """verify по истёкшему challenge → 410 auth.challenge_expired."""
    code = "123456"
    credentials = make_user_credentials()
    challenge = make_challenge(
        user_id=credentials.user_id,
        code_hash=fake_salted_hasher.hash(code),
        expires_at=_PAST,
    )
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    fake_challenge_repository.challenges.append(challenge)
    token = mint_access_token(credentials.user_id)

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": code},
    )

    assert response.status_code == 410
    assert response.json()["code"] == "auth.challenge_expired"


async def test_verify_attempts_exceeded_returns_429(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_challenge_repository: FakeChallengeRepository,
    fake_salted_hasher: FakeSaltedHasher,
    email_verification_settings: EmailVerificationSettings,
    mint_access_token: Callable[..., str],
) -> None:
    """verify при выбранном лимите попыток → 429 auth.challenge_attempts_exceeded."""
    code = "123456"
    credentials = make_user_credentials()
    challenge = make_challenge(
        user_id=credentials.user_id,
        code_hash=fake_salted_hasher.hash(code),
        attempts=email_verification_settings.email_verification_max_attempts,
    )
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    fake_challenge_repository.challenges.append(challenge)
    token = mint_access_token(credentials.user_id)

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": code},
    )

    assert response.status_code == 429
    assert response.json()["code"] == "auth.challenge_attempts_exceeded"


async def test_verify_malformed_code_returns_422(
    client: AsyncClient,
    mint_access_token: Callable[..., str],
) -> None:
    """verify с кодом не из 6 цифр → 422 validation_error (валидный Bearer, ошибка в теле)."""
    token = mint_access_token(uuid4())

    response = await client.post(
        _VERIFY_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"code": "abc"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
