"""Фейки клиентов к другим доменам: записывают вызовы для state-ассертов."""

from collections.abc import Collection
from uuid import UUID

from app.auth.application.ports.users_client import CreateUserRequest, UsersClientPort
from app.journeys.application.ports.places_client import PlacesClientPort


class FakeUsersClient(UsersClientPort):
    """
    Записывает каждый ``create_user`` в ``created`` вместо реального вызова users-сервиса.

    Тест может выставить ``error`` — тогда ``create_user`` поднимает его вместо записи,
    моделируя сбой создания users-профиля (например, для проверки атомарного rollback'а register).
    """

    def __init__(self) -> None:
        self.created: list[CreateUserRequest] = []
        self.error: Exception | None = None

    async def create_user(self, request: CreateUserRequest) -> None:
        if self.error is not None:
            raise self.error

        self.created.append(request)


class FakePlacesClient(PlacesClientPort):
    """Фейк клиента journeys → geo: знает набор существующих мест и записывает вызовы."""

    def __init__(self, *, existing_place_ids: Collection[UUID] = ()) -> None:
        self.existing_place_ids = set(existing_place_ids)
        self.calls: list[tuple[UUID, ...]] = []

    async def get_missing_place_ids(self, *, place_ids: Collection[UUID]) -> frozenset[UUID]:
        self.calls.append(tuple(place_ids))
        return frozenset(place_ids) - self.existing_place_ids
