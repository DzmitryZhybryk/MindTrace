from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.infra.repositories import CredentialsRepository, RefreshTokenRepository
from app.shared.infra.base_uow import BaseUnitOfWork


class AuthUnitOfWork(BaseUnitOfWork):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session)
        self.credentials_repository = CredentialsRepository(session=session)
        self.refresh_token_repository = RefreshTokenRepository(session=session)
