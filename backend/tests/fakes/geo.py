"""
In-memory фейк geo-репозитория поверх ``list[PlaceEntity]``.

Реализует ``PlaceRepositoryPort`` — тот же контракт, что и боевой SQLAlchemy-репозиторий,
поэтому ``ty`` ловит расхождение сигнатур. Повторяет наблюдаемое поведение поиска
(префиксный матч по имени en/ru, сортировка по убыванию населения, лимит), чтобы тот же
фейк годился и на api-уровне через ``app.dependency_overrides``.
"""

from app.geo.application.ports import PlaceRepositoryPort
from app.geo.domain.entities import PlaceEntity
from app.geo.domain.enums import Language


class FakePlaceRepository(PlaceRepositoryPort):
    """Фейк read-only поиска мест поверх ``list`` с префиксным матчем по имени."""

    def __init__(self) -> None:
        self.places: list[PlaceEntity] = []

    async def search_places_by_name(self, *, search_text: str, limit: int) -> list[PlaceEntity]:
        prefix = search_text.strip().lower()
        matched = [
            place_entity
            for place_entity in self.places
            if self._matches_prefix(place_entity=place_entity, prefix=prefix)
        ]
        matched.sort(key=lambda place_entity: place_entity.population, reverse=True)
        return matched[:limit]

    @staticmethod
    def _matches_prefix(*, place_entity: PlaceEntity, prefix: str) -> bool:
        """Совпадение, если имя на en ИЛИ ru начинается с префикса (как ``LIKE 'q%'`` в боевом репо)."""
        names = (place_entity.localized_name(language=Language.EN), place_entity.localized_name(language=Language.RU))
        return any(name is not None and name.lower().startswith(prefix) for name in names)
