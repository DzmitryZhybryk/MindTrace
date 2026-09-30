"""Фейки клиентов к другим доменам: записывают вызовы для state-ассертов."""

import datetime as dt
from collections.abc import Collection
from dataclasses import dataclass
from uuid import UUID

from app.auth.application.ports import UsersClientPort
from app.journeys.application.ports import PlacesClientPort


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


class FakePlacesClient(PlacesClientPort):
    """Фейк клиента journeys → geo: знает набор существующих мест и записывает вызовы."""

    def __init__(self, *, existing_place_ids: Collection[UUID] = ()) -> None:
        self.existing_place_ids = set(existing_place_ids)
        self.calls: list[tuple[UUID, ...]] = []

    async def get_missing_place_ids(self, *, place_ids: Collection[UUID]) -> frozenset[UUID]:
        self.calls.append(tuple(place_ids))
        return frozenset(place_ids) - self.existing_place_ids
