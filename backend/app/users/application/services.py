from app.users.application.ports import UserUnitOfWorkPort
from app.users.application.schemas import CreateUserCommand
from app.users.domain.entities import UserEntity


class UserService:
    """Сервис управления пользователями."""

    def __init__(self, uow: UserUnitOfWorkPort) -> None:
        self._uow = uow

    async def create_user(self, user: CreateUserCommand) -> None:
        """
        Создаёт нового пользователя в рамках транзакции вызывающего.

        НЕ коммитит: ``create_user`` — cross-domain участник use-case'а, чьей
        входной точкой владеет вызывающий (``AuthService.register``). Запись
        кладётся в общую сессию и фиксируется единственным ``commit()`` вызывающего —
        атомарно вместе с ``user_credentials`` и refresh-токеном. Любой сбой до
        этого commit'а откатывает всё, осиротевшей учётки не остаётся
        (Option A транзакционной модели, см. ``BaseUnitOfWork``).

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
        await self._uow.user_repository.insert_user(user_entity=user_entity)
