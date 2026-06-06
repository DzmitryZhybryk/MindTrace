"""
Тест-дата билдеры для доменных entity и value object'ов.

Обычные функции с kwargs-дефолтами и именованными аргументами; явные timestamp'ы
вместо заморозки времени (см. ``.claude/rules/python/testing.md``). Дефолты дают
«валидную» сущность; тест переопределяет только то, что проверяет.
"""

import datetime as dt
from uuid import UUID, uuid4

from app.auth.domain.entities import ChallengeEntity, RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.enums import ChallengeType, UserRole
from app.auth.domain.value_objects import Password
from app.users.domain.entities import UserEntity


def make_password(*, hash: str = "argon2-hash") -> Password:
    return Password(hash=hash)


def make_user_entity(
    *,
    user_id: UUID | None = None,
    username: str = "user",
    email: str = "user@example.com",
    terms_accepted_at: dt.datetime | None = None,
    marketing_emails_consent: bool = False,
    display_name: str | None = None,
    created_at: dt.datetime | None = None,
    updated_at: dt.datetime | None = None,
    deleted_at: dt.datetime | None = None,
) -> UserEntity:
    return UserEntity(
        user_id=user_id or uuid4(),
        username=username,
        email=email,
        terms_accepted_at=terms_accepted_at or dt.datetime.now(tz=dt.UTC),
        marketing_emails_consent=marketing_emails_consent,
        display_name=display_name,
        created_at=created_at,
        updated_at=updated_at,
        deleted_at=deleted_at,
    )


def make_refresh_token(
    *,
    token_id: UUID | None = None,
    user_id: UUID | None = None,
    token_hash: str = "token-hash",
    expires_at: dt.datetime | None = None,
    revoked_at: dt.datetime | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    created_at: dt.datetime | None = None,
    updated_at: dt.datetime | None = None,
) -> RefreshTokenEntity:
    return RefreshTokenEntity(
        token_id=token_id or uuid4(),
        user_id=user_id or uuid4(),
        token_hash=token_hash,
        expires_at=expires_at or (dt.datetime.now(tz=dt.UTC) + dt.timedelta(days=30)),
        revoked_at=revoked_at,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=created_at,
        updated_at=updated_at,
    )


def make_user_credentials(
    *,
    user_id: UUID | None = None,
    email: str = "user@example.com",
    username: str = "user",
    password: Password | None = None,
    role: UserRole = UserRole.FREE,
    email_verified_at: dt.datetime | None = None,
    created_at: dt.datetime | None = None,
    updated_at: dt.datetime | None = None,
) -> UserCredentialsEntity:
    return UserCredentialsEntity(
        user_id=user_id or uuid4(),
        email=email,
        username=username,
        password=password or make_password(),
        role=role,
        email_verified_at=email_verified_at,
        created_at=created_at,
        updated_at=updated_at,
    )


def make_challenge(
    *,
    challenge_id: UUID | None = None,
    user_id: UUID | None = None,
    challenge_type: ChallengeType = ChallengeType.EMAIL_VERIFICATION,
    code_hash: str = "code-hash",
    expires_at: dt.datetime | None = None,
    attempts: int = 0,
    used_at: dt.datetime | None = None,
    created_at: dt.datetime | None = None,
    updated_at: dt.datetime | None = None,
) -> ChallengeEntity:
    return ChallengeEntity(
        challenge_id=challenge_id or uuid4(),
        user_id=user_id or uuid4(),
        challenge_type=challenge_type,
        code_hash=code_hash,
        expires_at=expires_at or (dt.datetime.now(tz=dt.UTC) + dt.timedelta(minutes=15)),
        attempts=attempts,
        used_at=used_at,
        created_at=created_at,
        updated_at=updated_at,
    )
