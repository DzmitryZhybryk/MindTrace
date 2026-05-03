import datetime as dt
from typing import Self
from uuid import UUID, uuid4

from app.auth.domain.enums import UserRole
from app.auth.domain.value_objects import Password
from app.shared.domain.domain_mixins import TimestampedEntityMixin


class UserCredentialsEntity(TimestampedEntityMixin):
    def __init__(
        self,
        user_id: UUID,
        email: str,
        username: str,
        password: Password,
        role: UserRole,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.user_id = user_id
        self.email = email
        self.username = username
        self.password = password
        self.role = role

    @classmethod
    def create(
        cls,
        email: str,
        username: str,
        password: Password,
        role: UserRole = UserRole.FREE,
    ) -> Self:
        return cls(
            user_id=uuid4(),
            email=email,
            username=username,
            password=password,
            role=role,
        )


class RefreshTokenEntity:
    def __init__(
        self,
        token_id: UUID,
        user_id: UUID,
        expires_at: dt.datetime,
        last_seen_at: dt.datetime,
        revoked_at: dt.datetime | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        self.token_id = token_id
        self.user_id = user_id
        self.expires_at = expires_at
        self.last_seen_at = last_seen_at
        self.revoked_at = revoked_at
        self.ip_address = ip_address
        self.user_agent = user_agent

    @classmethod
    def create_refresh_token_entity(
        cls,
        user_id: UUID,
        ttl_days: int,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Self:
        now = dt.datetime.now(tz=dt.UTC)
        return cls(
            token_id=uuid4(),
            user_id=user_id,
            expires_at=now + dt.timedelta(days=ttl_days),
            last_seen_at=now,
            ip_address=ip_address,
            user_agent=user_agent,
        )

    def is_active(self, *, now: dt.datetime) -> bool:
        """
        Проверяет, что токен не отозван и не истёк.

        Время передаётся снаружи, чтобы метод оставался чистым: одно и то же
        ``now`` можно использовать для нескольких проверок в рамках одной
        операции, и тесты получают полную власть над временем.

        Args:
            now: Текущий момент времени, относительно которого проверяется срок жизни

        Returns:
            ``True``, если токен можно использовать; иначе ``False``
        """
        return self.revoked_at is None and self.expires_at > now
