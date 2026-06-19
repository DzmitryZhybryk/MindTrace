"""
api-тесты auth-роутов (register/login/logout/refresh) через ASGI без реальной БД.

Пиннят внешний HTTP-контракт: статус-коды, тело ``TokenResponse``, машинные ``code``
доменных ошибок и атрибуты refresh-cookie. I/O-граница (UoW/репо, users-client, task-bus,
argon2) — фейки; DI-граф, выпуск/декод JWT, куки и exception-handler'ы — настоящие.
"""

import datetime as dt
from collections.abc import Callable

import pytest
from httpx import AsyncClient, Response

from app.shared.infra.crypto import Sha256DeterministicHasher
from tests.builders import make_password, make_refresh_token, make_user_credentials
from tests.fakes import (
    FakeRefreshTokenRepository,
    FakeSaltedHasher,
    FakeUserCredentialsRepository,
    FakeUsersClient,
)

# --- register ---------------------------------------------------------------


async def test_register_valid_body_returns_201_with_token_and_cookie(
    client: AsyncClient,
    fake_users_client: FakeUsersClient,
    find_set_cookie: Callable[[Response, str], str | None],
) -> None:
    """register с валидным телом → 201, access-токен в теле и refresh в HttpOnly-cookie."""
    response = await client.post(
        "/v1/auth/register/",
        json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "password123",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["accessToken"]
    assert body["tokenType"] == "bearer"
    assert len(fake_users_client.created) == 1

    set_cookie = find_set_cookie(response, "refresh_token")
    assert set_cookie is not None
    assert "httponly" in set_cookie.lower()
    assert "secure" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()
    assert "path=/" in set_cookie.lower()


async def test_register_terms_not_accepted_returns_400(client: AsyncClient) -> None:
    """register с terms_accepted=false → 400 auth.terms_not_accepted (доменная ошибка из валидатора схемы)."""
    response = await client.post(
        "/v1/auth/register/",
        json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "password123",
            "terms_accepted": False,
            "marketing_emails_consent": False,
        },
    )

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "auth.terms_not_accepted"
    assert body["details"] == {"field": "terms_accepted"}


async def test_register_email_already_registered_returns_409(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
) -> None:
    """register с занятым email → 409 auth.email_already_registered (details.field=email)."""
    existing = make_user_credentials(email="taken@example.com", username="someoneelse")
    fake_user_credentials_repository.by_user_id[existing.user_id] = existing

    response = await client.post(
        "/v1/auth/register/",
        json={
            "username": "freshname",
            "email": "taken@example.com",
            "password": "password123",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "auth.email_already_registered"
    assert body["details"] == {"field": "email"}


async def test_register_username_already_taken_returns_409(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
) -> None:
    """register со свободным email, но занятым username → 409 auth.username_already_taken (details.field=username)."""
    existing = make_user_credentials(email="someone@example.com", username="takenname")
    fake_user_credentials_repository.by_user_id[existing.user_id] = existing

    response = await client.post(
        "/v1/auth/register/",
        json={
            "username": "takenname",
            "email": "fresh@example.com",
            "password": "password123",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "auth.username_already_taken"
    assert body["details"] == {"field": "username"}


@pytest.mark.parametrize(
    "invalid_body",
    [
        {
            "username": "ab",
            "email": "valid@example.com",
            "password": "password123",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
        {
            "username": "validname",
            "email": "not-an-email",
            "password": "password123",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
        {
            "username": "validname",
            "email": "valid@example.com",
            "password": "short",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
    ],
)
async def test_register_invalid_field_returns_422(client: AsyncClient, invalid_body: dict[str, object]) -> None:
    """register с невалидным полем (короткий username / битый email / короткий пароль) → 422 validation_error."""
    response = await client.post("/v1/auth/register/", json=invalid_body)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


# --- login -------------------------------------------------------------------


async def test_login_valid_credentials_returns_200_with_token_and_cookie(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_salted_hasher: FakeSaltedHasher,
    find_set_cookie: Callable[[Response, str], str | None],
) -> None:
    """login с верными кредами → 200, access-токен в теле и refresh в HttpOnly-cookie."""
    secret = "password123"
    credentials = make_user_credentials(
        email="user@example.com",
        username="user",
        password=make_password(hash=fake_salted_hasher.hash(secret)),
    )
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials

    response = await client.post("/v1/auth/login/", json={"login": "user@example.com", "password": secret})

    assert response.status_code == 200
    body = response.json()
    assert body["accessToken"]
    assert body["tokenType"] == "bearer"
    assert find_set_cookie(response, "refresh_token") is not None


async def test_login_wrong_password_returns_401(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_salted_hasher: FakeSaltedHasher,
) -> None:
    """login с неверным паролем → 401 auth.invalid_credentials."""
    credentials = make_user_credentials(
        email="user@example.com",
        password=make_password(hash=fake_salted_hasher.hash("correct-password")),
    )
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials

    response = await client.post("/v1/auth/login/", json={"login": "user@example.com", "password": "wrong-password"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_credentials"


async def test_login_unknown_login_returns_401(client: AsyncClient) -> None:
    """login с несуществующим логином → 401 auth.invalid_credentials (тот же код — анти-enumeration)."""
    response = await client.post("/v1/auth/login/", json={"login": "ghost@example.com", "password": "whatever123"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_credentials"


async def test_login_invalid_body_returns_422(client: AsyncClient) -> None:
    """login без обязательного password → 422 validation_error."""
    response = await client.post("/v1/auth/login/", json={"login": "user@example.com"})

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


# --- logout ------------------------------------------------------------------


async def test_logout_revokes_token_and_clears_cookie(
    client: AsyncClient,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
    deterministic_hasher: Sha256DeterministicHasher,
    find_set_cookie: Callable[[Response, str], str | None],
) -> None:
    """logout с активным refresh-токеном → 204, токен отозван, cookie очищена (Max-Age=0)."""
    secret = "active-refresh-secret"
    token = make_refresh_token(token_hash=deterministic_hasher.digest(secret=secret))
    fake_refresh_token_repository.by_hash[token.token_hash] = token

    response = await client.post("/v1/auth/logout/", headers={"Cookie": f"refresh_token={secret}"})

    assert response.status_code == 204
    assert token.is_revoked
    set_cookie = find_set_cookie(response, "refresh_token")
    assert set_cookie is not None
    assert "max-age=0" in set_cookie.lower()


async def test_logout_without_cookie_returns_204(
    client: AsyncClient,
    find_set_cookie: Callable[[Response, str], str | None],
) -> None:
    """logout без cookie → 204 (идемпотентно), всё равно отдаёт очищающую cookie."""
    response = await client.post("/v1/auth/logout/")

    assert response.status_code == 204
    assert find_set_cookie(response, "refresh_token") is not None


async def test_logout_unknown_secret_returns_204(client: AsyncClient) -> None:
    """logout с неизвестным секретом → 204 (идемпотентно), без ошибки."""
    response = await client.post("/v1/auth/logout/", headers={"Cookie": "refresh_token=nonexistent-secret"})

    assert response.status_code == 204


# --- refresh -----------------------------------------------------------------


async def test_refresh_rotates_token_and_sets_new_cookie(
    client: AsyncClient,
    fake_user_credentials_repository: FakeUserCredentialsRepository,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
    deterministic_hasher: Sha256DeterministicHasher,
    find_set_cookie: Callable[[Response, str], str | None],
) -> None:
    """refresh с валидным токеном → 200, старый токен отозван, в cookie новый секрет."""
    secret = "old-refresh-secret"
    credentials = make_user_credentials()
    token = make_refresh_token(user_id=credentials.user_id, token_hash=deterministic_hasher.digest(secret=secret))
    fake_user_credentials_repository.by_user_id[credentials.user_id] = credentials
    fake_refresh_token_repository.by_hash[token.token_hash] = token

    response = await client.post("/v1/auth/refresh/", headers={"Cookie": f"refresh_token={secret}"})

    assert response.status_code == 200
    assert response.json()["accessToken"]
    assert token.is_revoked
    assert len(fake_refresh_token_repository.by_hash) == 2

    set_cookie = find_set_cookie(response, "refresh_token")
    assert set_cookie is not None
    new_secret = set_cookie.split(";")[0].split("=", 1)[1]
    assert new_secret
    assert new_secret != secret


async def test_refresh_without_cookie_returns_401(client: AsyncClient) -> None:
    """refresh без cookie → 401 auth.invalid_refresh_token (ротация невозможна)."""
    response = await client.post("/v1/auth/refresh/")

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_refresh_token"


async def test_refresh_unknown_secret_returns_401(client: AsyncClient) -> None:
    """refresh с неизвестным секретом → 401 auth.invalid_refresh_token."""
    response = await client.post("/v1/auth/refresh/", headers={"Cookie": "refresh_token=ghost-secret"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_refresh_token"


async def test_refresh_revoked_token_returns_401(
    client: AsyncClient,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
    deterministic_hasher: Sha256DeterministicHasher,
    past: dt.datetime,
) -> None:
    """refresh уже отозванным токеном → 401 auth.invalid_refresh_token (reuse detection)."""
    secret = "revoked-refresh-secret"
    token = make_refresh_token(token_hash=deterministic_hasher.digest(secret=secret), revoked_at=past)
    fake_refresh_token_repository.by_hash[token.token_hash] = token

    response = await client.post("/v1/auth/refresh/", headers={"Cookie": f"refresh_token={secret}"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_refresh_token"


async def test_refresh_expired_token_returns_401(
    client: AsyncClient,
    fake_refresh_token_repository: FakeRefreshTokenRepository,
    deterministic_hasher: Sha256DeterministicHasher,
    past: dt.datetime,
) -> None:
    """refresh истёкшим токеном → 401 auth.invalid_refresh_token."""
    secret = "expired-refresh-secret"
    token = make_refresh_token(token_hash=deterministic_hasher.digest(secret=secret), expires_at=past)
    fake_refresh_token_repository.by_hash[token.token_hash] = token

    response = await client.post("/v1/auth/refresh/", headers={"Cookie": f"refresh_token={secret}"})

    assert response.status_code == 401
    assert response.json()["code"] == "auth.invalid_refresh_token"
