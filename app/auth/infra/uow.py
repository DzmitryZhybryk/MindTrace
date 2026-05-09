from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.infra.repositories import (
    EmailVerificationTokenRepository,
    RefreshTokenRepository,
    UserCredentialsRepository,
)
from app.shared.infra.base_uow import BaseUnitOfWork


class AuthUnitOfWork(BaseUnitOfWork):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session)
        self.user_credentials_repository = UserCredentialsRepository(session=session)
        self.refresh_token_repository = RefreshTokenRepository(session=session)
        self.email_verification_token_repository = EmailVerificationTokenRepository(session=session)
