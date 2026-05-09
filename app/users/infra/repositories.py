from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared.repositories.base_repository import BaseDBRepository
from app.users.domain.entities import UserEntity
from app.users.infra.models import User


class UserRepository(BaseDBRepository[User]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session, model=User)

    async def get_by_id(self, user_id: UUID) -> UserEntity | None:
        query = select(User).where(User.id == user_id)
        model = await self._fetch_one(query=query)
        return self._to_entity(user_model=model) if model else None

    async def insert_user(self, user_entity: UserEntity) -> None:
        await self.insert(data=self._to_model(user_entity=user_entity))

    def _to_model(self, user_entity: UserEntity) -> User:
        return User(
            id=user_entity.user_id,
            username=user_entity.username,
            email=user_entity.email,
            display_name=user_entity.display_name,
            terms_accepted_at=user_entity.terms_accepted_at,
            marketing_emails_consent=user_entity.marketing_emails_consent,
            created_at=user_entity.created_at,
            updated_at=user_entity.updated_at,
            deleted_at=user_entity.deleted_at,
        )

    def _to_entity(self, user_model: User) -> UserEntity:
        return UserEntity(
            user_id=user_model.id,
            username=user_model.username,
            email=user_model.email,
            display_name=user_model.display_name,
            terms_accepted_at=user_model.terms_accepted_at,
            marketing_emails_consent=user_model.marketing_emails_consent,
            created_at=user_model.created_at,
            updated_at=user_model.updated_at,
            deleted_at=user_model.deleted_at,
        )
