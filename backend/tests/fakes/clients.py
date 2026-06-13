"""Фейк ``UsersClientPort``: записывает вызовы ``create_user`` для state-ассертов."""

import datetime as dt
from dataclasses import dataclass
from uuid import UUID

from app.auth.application.ports import UsersClientPort


@dataclass(frozen=True, slots=True)
class CreatedUserCall:
    """Запись одного вызова ``create_user``."""

    user_id: UUID
    username: str
    email: str
    marketing_emails_consent: bool
    terms_accepted_at: dt.datetime


class FakeUsersClient(UsersClientPort):
    """
    Записывает каждый ``create_user`` в ``created`` вместо реального вызова users-сервиса.

    Тест может выставить ``error`` — тогда ``create_user`` поднимает его вместо записи,
    моделируя сбой создания users-профиля (например, для проверки атомарного rollback'а register).
    """

    def __init__(self) -> None:
        self.created: list[CreatedUserCall] = []
        self.error: Exception | None = None

    async def create_user(
        self,
        *,
        user_id: UUID,
        username: str,
        email: str,
        marketing_emails_consent: bool,
        terms_accepted_at: dt.datetime,
    ) -> None:
        if self.error is not None:
            raise self.error

        self.created.append(
            CreatedUserCall(
                user_id=user_id,
                username=username,
                email=email,
                marketing_emails_consent=marketing_emails_consent,
                terms_accepted_at=terms_accepted_at,
            ),
        )
