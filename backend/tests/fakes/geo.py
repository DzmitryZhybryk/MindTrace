"""
In-memory фейки geo: репозиторий поверх ``list[PlaceEntity]`` и UoW вокруг него.

Реализуют порты ``app.geo.application.ports.*`` — тот же контракт, что и боевые реализации,
поэтому ``ty`` ловит расхождение сигнатур. Репозиторий повторяет наблюдаемое поведение поиска
(префиксный матч по имени en/ru, сортировка по убыванию населения, лимит), чтобы тот же
фейк годился и на api-уровне через ``app.dependency_overrides``.
"""

from collections.abc import AsyncGenerator, Collection
from contextlib import asynccontextmanager
from uuid import UUID

from app.geo.application.ports.place_repository import PlaceRepositoryPort
from app.geo.application.ports.unit_of_work import GeoUnitOfWorkPort
from app.geo.domain.entities import PlaceEntity
from app.geo.domain.enums import Language


class FakePlaceRepository(PlaceRepositoryPort):
    """Фейк read-only поиска мест поверх ``list`` с префиксным матчем по имени."""

    def __init__(self) -> None:
        self.places: list[PlaceEntity] = []

    async def search_places_by_name(self, *, search_text: str, limit: int) -> tuple[PlaceEntity, ...]:
        prefix = search_text.strip().lower()
        matched = [
            place_entity
            for place_entity in self.places
            if self._matches_prefix(place_entity=place_entity, prefix=prefix)
        ]
        matched.sort(key=lambda place_entity: (place_entity.population is None, -(place_entity.population or 0)))
        return tuple(matched[:limit])

    async def find_places_by_ids(self, *, place_ids: Collection[UUID]) -> tuple[PlaceEntity, ...]:
        return tuple(place_entity for place_entity in self.places if place_entity.place_id in place_ids)

    @staticmethod
    def _matches_prefix(*, place_entity: PlaceEntity, prefix: str) -> bool:
        """Совпадение, если имя на en ИЛИ ru начинается с префикса (как ``LIKE 'q%'`` в боевом репо)."""
        names = (place_entity.localized_name(language=Language.EN), place_entity.localized_name(language=Language.RU))
        return any(name is not None and name.lower().startswith(prefix) for name in names)


class FakeGeoUnitOfWork(GeoUnitOfWorkPort):
    """In-memory UoW geo: фейк-репозиторий и no-op ``transaction``, считающая открытые области."""

    def __init__(self, *, place_repository: PlaceRepositoryPort) -> None:
        self.place_repository = place_repository
        self.transactions_started = 0

    @asynccontextmanager
    async def transaction(self) -> AsyncGenerator[None]:
        self.transactions_started += 1
        yield
