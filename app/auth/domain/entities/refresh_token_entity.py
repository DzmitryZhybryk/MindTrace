import datetime as dt
from typing import Self
from uuid import UUID, uuid4


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
