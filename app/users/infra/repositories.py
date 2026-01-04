from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.repositories.base_repository import BaseDBRepository
from app.users.infra.models import User


class UserRepository(BaseDBRepository[User]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, User)
