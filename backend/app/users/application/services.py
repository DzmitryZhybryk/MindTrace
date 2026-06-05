from app.users.application.schemas import CreateUserCommand
from app.users.domain.entities import UserEntity
from app.users.infra.user_uow import UserUnitOfWork


class UserService:
    """Сервис управления пользователями."""

    def __init__(self, uow: UserUnitOfWork) -> None:
        self.uow = uow

    async def create_user(self, user: CreateUserCommand) -> None:
        """
        Создаёт нового пользователя.

        Args:
            user: Данные для создания пользователя.
        """
        user_entity = UserEntity.create_new_user_entity(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
            marketing_emails_consent=user.marketing_emails_consent,
            terms_accepted_at=user.terms_accepted_at,
        )
        await self.uow.user_repository.insert_user(user_entity=user_entity)
        await self.uow.commit()
