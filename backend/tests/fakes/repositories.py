"""
In-memory фейки auth-репозиториев.

Каждый фейк реализует соответствующий порт из ``app.auth.application.ports`` —
тот же контракт, что и реальный SQLAlchemy-репозиторий. ``ty`` сверяет обе
реализации с портом, поэтому фейк не может молча разойтись с боевой сигнатурой.

Сторадж — обычные ``dict``/``list``; сущности кладутся и достаются по ссылке,
поэтому доменные мутации (``revoke()``, ``mark_used()``) видны без отдельного
``update``-вызова (моделирует identity map SQLAlchemy-сессии).
"""

from uuid import UUID

from app.auth.application.ports import (
    ChallengeRepositoryPort,
    RefreshTokenRepositoryPort,
    UserCredentialsRepositoryPort,
)
from app.auth.domain.entities import ChallengeEntity, RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.enums import ChallengeType


class FakeUserCredentialsRepository(UserCredentialsRepositoryPort):
    """Фейк хранилища учётных данных поверх ``dict`` по ``user_id``."""

    def __init__(self) -> None:
        self.by_user_id: dict[UUID, UserCredentialsEntity] = {}

    async def insert_user_credentials(self, credentials: UserCredentialsEntity) -> None:
        self.by_user_id[credentials.user_id] = credentials

    async def update_user_credentials_by_user_id(self, credentials: UserCredentialsEntity) -> None:
        self.by_user_id[credentials.user_id] = credentials

    async def find_user_credentials_by_user_id(self, user_id: UUID) -> UserCredentialsEntity | None:
        return self.by_user_id.get(user_id)

    async def find_user_credentials_by_email_or_username(
        self,
        email: str,
        username: str,
    ) -> list[UserCredentialsEntity]:
        return [c for c in self.by_user_id.values() if c.email == email or c.username == username]


class FakeRefreshTokenRepository(RefreshTokenRepositoryPort):
    """Фейк хранилища refresh-токенов поверх ``dict`` по ``token_hash``."""

    def __init__(self) -> None:
        self.by_hash: dict[str, RefreshTokenEntity] = {}

    async def insert_refresh_token(self, token: RefreshTokenEntity) -> None:
        self.by_hash[token.token_hash] = token

    async def find_refresh_token_by_hash_for_update(self, token_hash: str) -> RefreshTokenEntity | None:
        return self.by_hash.get(token_hash)

    async def update_refresh_token_by_id(self, token: RefreshTokenEntity) -> None:
        # Сущность мутируется на месте; стор держит ту же ссылку — переписываем для явности.
        self.by_hash[token.token_hash] = token

    async def revoke_all_active_refresh_tokens_by_user_id(self, user_id: UUID) -> None:
        for token in self.by_hash.values():
            if token.user_id == user_id and not token.is_revoked:
                token.revoke()


class FakeChallengeRepository(ChallengeRepositoryPort):
    """Фейк хранилища challenge'ей поверх ``list`` (хранит и активные, и использованные)."""

    def __init__(self) -> None:
        self.challenges: list[ChallengeEntity] = []

    async def insert_challenge(self, challenge: ChallengeEntity) -> None:
        self.challenges.append(challenge)

    async def find_active_challenge_for_update(
        self,
        user_id: UUID,
        challenge_type: ChallengeType,
    ) -> ChallengeEntity | None:
        return next(
            (
                c
                for c in self.challenges
                if c.user_id == user_id and c.challenge_type == challenge_type and c.used_at is None
            ),
            None,
        )

    async def update_challenge_by_id(self, challenge: ChallengeEntity) -> None:
        """No-op: сущность мутируется на месте, список держит ту же ссылку."""
