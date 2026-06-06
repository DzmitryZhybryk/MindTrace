import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from app.auth.application.ports import UsersClientPort
from app.users.application.schemas import CreateUserCommand
from app.users.application.services import UserService


@dataclass(frozen=True, slots=True)
class CreateUserRequest:
    """
    Контракт исходящего вызова users-сервиса: создание пользователя.

    Отдельный тип на стороне auth даже при совпадении полей с users-доменом
    намеренно: защищает auth от изменений схемы users и фиксирует ровно тот
    набор полей, который auth отправляет в users.
    """

    user_id: UUID
    username: str
    email: str
    marketing_emails_consent: bool
    terms_accepted_at: dt.datetime


class InternalUsersClient(UsersClientPort):
    """Адаптер ``UsersClientPort``: маппит application-данные в wire-``CreateUserRequest`` и зовёт ``UserService``."""

    def __init__(self, user_service: UserService) -> None:
        self._user_service = user_service

    async def create_user(
        self,
        *,
        user_id: UUID,
        username: str,
        email: str,
        marketing_emails_consent: bool,
        terms_accepted_at: dt.datetime,
    ) -> None:
        request = CreateUserRequest(
            user_id=user_id,
            username=username,
            email=email,
            marketing_emails_consent=marketing_emails_consent,
            terms_accepted_at=terms_accepted_at,
        )
        await self._user_service.create_user(
            user=CreateUserCommand.model_validate(request, from_attributes=True),
        )
