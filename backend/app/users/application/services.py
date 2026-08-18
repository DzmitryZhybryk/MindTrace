from uuid import UUID

from app.users.application.ports import UserUnitOfWorkPort
from app.users.application.schemas import CreateUserCommand, CurrentUserResult
from app.users.domain.entities import UserEntity
from app.users.exceptions import UserNotFoundError


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
        user_entity = UserEntity.create(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
            marketing_emails_consent=user.marketing_emails_consent,
            terms_accepted_at=user.terms_accepted_at,
        )
        await self._uow.user_repository.insert_user(user_entity=user_entity)

    async def get_current_user(self, user_id: UUID) -> CurrentUserResult:
        """
        Возвращает профиль текущего пользователя.

        Read-only use case: транзакция закрывается без ``commit()``, rollback-by-default
        ничего не откатывает.

        Args:
            user_id: Идентификатор пользователя из access-токена.

        Returns:
            Профиль пользователя.

        Raises:
            UserNotFoundError: Если пользователь не найден.
            UserDeletedError: Если пользователь удалён (soft-delete).
        """
        async with self._uow.transaction():
            user_entity = await self._uow.user_repository.find_user_by_id(user_id=user_id)
            if user_entity is None:
                raise UserNotFoundError()

            user_entity.ensure_not_deleted()

        return CurrentUserResult(
            username=user_entity.username,
            email=user_entity.email,
            display_name=user_entity.display_name,
        )
