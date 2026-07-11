"""
In-memory фейки journeys: репозиторий поверх ``list`` и UoW с мокнутым commit.

Каждый фейк реализует соответствующий порт из ``app.journeys.application.ports`` — тот же
контракт, что и боевые реализации, поэтому ``ty`` ловит расхождение сигнатур. ``transaction``
у UoW — no-op область (rollback реальной сессии проверяется в integration), ``commit`` —
``AsyncMock`` (``commit_mock``) для проверки факта фиксации. Те же фейки переиспользуются на
api-уровне через ``app.dependency_overrides``.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import UUID

from app.journeys.application.ports import JourneyRepositoryPort, JourneyUnitOfWorkPort
from app.journeys.domain.entities import JourneyEntity


class FakeJourneyRepository(JourneyRepositoryPort):
    """Фейк хранилища поездок поверх ``list``: собирает вставки, отдаёт чтение как боевой репо."""

    def __init__(self) -> None:
        self.journeys: list[JourneyEntity] = []

    async def insert_journey(self, journey_entity: JourneyEntity) -> None:
        self.journeys.append(journey_entity)

    async def find_journeys_by_user_id(self, *, user_id: UUID) -> list[JourneyEntity]:
        # Повторяет боевую выборку: только свои неудалённые поездки, по дате поездки (см. SQL-репо).
        matching = [
            journey_entity
            for journey_entity in self.journeys
            if journey_entity.user_id == user_id and journey_entity.deleted_at is None
        ]
        return sorted(matching, key=lambda journey_entity: journey_entity.traveled_on.value)


class FakeJourneyUnitOfWork(JourneyUnitOfWorkPort):
    """In-memory UoW journeys: фейк-репозиторий + мокнутый ``commit`` и no-op ``transaction``."""

    def __init__(self, *, journey_repository: JourneyRepositoryPort) -> None:
        self.journey_repository = journey_repository
        self.commit_mock = AsyncMock()

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        yield

    async def commit(self) -> None:
        await self.commit_mock()
