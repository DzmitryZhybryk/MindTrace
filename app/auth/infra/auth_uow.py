from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.infra.base_uow import BaseUnitOfWork


class AuthUnitOfWork(BaseUnitOfWork):
    def __init__(self, session: AsyncSession):
        super().__init__(session=session)
