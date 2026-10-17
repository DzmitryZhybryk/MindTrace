from typing import Protocol
from uuid import UUID

from app.auth.domain.entities import ChallengeEntity
from app.auth.domain.enums import ChallengeType

__all__ = ["ChallengeRepositoryPort"]


class ChallengeRepositoryPort(Protocol):
    """Контракт хранилища challenge'ей, на который опирается application-слой."""

    async def insert_challenge(self, challenge_entity: ChallengeEntity) -> None: ...

    async def find_active_challenge_for_update(
        self,
        *,
        user_id: UUID,
        challenge_type: ChallengeType,
    ) -> ChallengeEntity | None: ...

    async def update_challenge_by_id(self, challenge_entity: ChallengeEntity) -> None: ...
