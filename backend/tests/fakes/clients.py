"""Фейки клиентов к другим доменам: записывают вызовы для state-ассертов."""

from collections.abc import Collection
from uuid import UUID

from app.auth.application.ports.users_client import CreateUserRequest, UsersClientPort
from app.journeys.application.ports.places_client import PlaceLocation, PlacesClientPort


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
    """
    Фейк клиента journeys → geo: хранит места справочника и записывает вызовы.

    Найденные места отдаёт в порядке хранения, а не запроса — как geo, у которого порядок
    произвольный; тест может переставить ``locations``, чтобы проверить сопоставление по id.
    """

    def __init__(self, *, locations: Collection[PlaceLocation] = ()) -> None:
        self.locations = {location.place_id: location for location in locations}
        self.calls: list[tuple[UUID, ...]] = []

    async def find_place_locations(self, *, place_ids: Collection[UUID]) -> tuple[PlaceLocation, ...]:
        self.calls.append(tuple(place_ids))
        return tuple(location for place_id, location in self.locations.items() if place_id in place_ids)
