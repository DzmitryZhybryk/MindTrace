from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.infra.postgres.uow import BaseUnitOfWork
from app.users.infra.repositories import UserRepository


class UserUnitOfWork(BaseUnitOfWork):
    def __init__(self, session: AsyncSession):
        super().__init__(session=session)
        self.user_repository = UserRepository(session=session)
