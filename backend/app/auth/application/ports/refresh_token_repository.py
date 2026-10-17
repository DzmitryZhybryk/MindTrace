from typing import Protocol
from uuid import UUID

from app.auth.domain.entities import RefreshTokenEntity

__all__ = ["RefreshTokenRepositoryPort"]


class RefreshTokenRepositoryPort(Protocol):
    """Контракт хранилища refresh-токенов, на который опирается application-слой."""

    async def insert_refresh_token(self, refresh_token_entity: RefreshTokenEntity) -> None: ...

    async def find_refresh_token_by_hash_for_update(self, token_hash: str) -> RefreshTokenEntity | None: ...

    async def update_refresh_token_by_id(self, refresh_token_entity: RefreshTokenEntity) -> None: ...

    async def revoke_all_active_refresh_tokens_by_user_id(self, user_id: UUID) -> None: ...
