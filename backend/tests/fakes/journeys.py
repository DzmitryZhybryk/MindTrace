"""
In-memory фейки journeys: репозиторий поверх ``list``/``dict`` и UoW с мокнутым commit.

Каждый фейк реализует соответствующий порт из ``app.journeys.application.ports`` — тот же
контракт, что и боевые реализации, поэтому ``ty`` ловит расхождение сигнатур. ``transaction``
у UoW — no-op область (rollback реальной сессии проверяется в integration), ``commit`` —
``AsyncMock`` (``commit_mock``) для проверки факта фиксации. Те же фейки переиспользуются на
api-уровне через ``app.dependency_overrides``.

Выборки мест фейк не вычисляет из поездок, а отдаёт то, что задал тест: их правила (годы,
фильтры, порядок) живут в SQL и проверяются integration-тестами репозитория — пересчёт в
Python продублировал бы их.
"""

from collections.abc import AsyncIterator, Collection
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import UUID

from app.journeys.application.ports import JourneyRepositoryPort, JourneyUnitOfWorkPort
from app.journeys.application.schemas import MovementConnection, VisitedPlace
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import TransportType


class FakeJourneyRepository(JourneyRepositoryPort):
    """Фейк хранилища поездок: собирает вставки, выборки мест отдаёт заданными тестом."""

    def __init__(self) -> None:
        self.journeys: list[JourneyEntity] = []
        self.visited_places_by_user_id: dict[UUID, list[VisitedPlace]] = {}
        self.movement_connections_by_user_id: dict[UUID, list[MovementConnection]] = {}
        self.year_bounds_by_user_id: dict[UUID, tuple[int, int]] = {}

    async def insert_journey(self, journey_entity: JourneyEntity) -> None:
        self.journeys.append(journey_entity)

    async def find_visited_places_by_user_id(self, *, user_id: UUID) -> list[VisitedPlace]:
        return self.visited_places_by_user_id.get(user_id, [])

    async def find_movement_connections_by_user_id(
        self,
        *,
        user_id: UUID,
        year_from: int | None,
        year_to: int | None,
        transport_types: Collection[TransportType] | None,
    ) -> list[MovementConnection]:
        return self.movement_connections_by_user_id.get(user_id, [])

    async def find_journey_year_bounds_by_user_id(self, *, user_id: UUID) -> tuple[int, int] | None:
        return self.year_bounds_by_user_id.get(user_id)


class FakeJourneyUnitOfWork(JourneyUnitOfWorkPort):
    """In-memory UoW journeys: фейк-репозиторий + мокнутый ``commit`` и no-op ``transaction``."""

    def __init__(self, *, journey_repository: JourneyRepositoryPort) -> None:
        self.journey_repository = journey_repository
        self.commit_mock = AsyncMock()
        self.transactions_started = 0

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        self.transactions_started += 1
        yield

    async def commit(self) -> None:
        await self.commit_mock()
