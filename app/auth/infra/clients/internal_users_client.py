import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from app.users.application.schemas import UserCreate as ExternalUserCreate
from app.users.application.services import UserService


@dataclass(frozen=True, slots=True)
class UserCreate:
    """
    Входной контракт auth-домена для создания пользователя в users-домене.

    Отдельный тип в auth-домене (даже при совпадающем имени с users) намеренно:
    защищает auth от изменений схемы в users и фиксирует ровно тот набор полей,
    который auth передаёт в users-сервис.
    """

    user_id: UUID
    username: str
    email: str
    marketing_emails_consent: bool
    terms_accepted_at: dt.datetime


class InternalUsersClient:
    def __init__(self, user_service: UserService) -> None:
        self._user_service = user_service

    async def create_user(self, user: UserCreate) -> None:
        await self._user_service.create_user(
            user=ExternalUserCreate.model_validate(user, from_attributes=True),
        )
