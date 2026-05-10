from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.infra.repositories import (
    ChallengeRepository,
    RefreshTokenRepository,
    UserCredentialsRepository,
)
from app.shared.infra.postgres.uow import BaseUnitOfWork


class AuthUnitOfWork(BaseUnitOfWork):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session)
        self.user_credentials_repository = UserCredentialsRepository(session=session)
        self.refresh_token_repository = RefreshTokenRepository(session=session)
        self.challenge_repository = ChallengeRepository(session=session)
