from collections.abc import Collection
from typing import Protocol
from uuid import UUID

from app.geo.domain.entities import PlaceEntity

__all__ = ["PlaceRepositoryPort"]


class PlaceRepositoryPort(Protocol):
    """Контракт read-only поиска мест по газеттиру, на который опирается application-слой."""

    async def search_places_by_name(self, *, search_text: str, limit: int) -> tuple[PlaceEntity, ...]:
        """
        Ищет места по имени (en/ru), отсортированные по убыванию населения.

        Матч идёт по ПРЕФИКСУ имени (``search_text`` в начале), а не по подстроке:
        'york' не найдёт 'New York'. Это контракт метода, на который опирается вызывающий.

        Args:
            search_text: Начало имени для поиска. Репозиторий экранирует
                LIKE-метасимволы (``%`` ``_`` ``\\``) перед подстановкой в паттерн.
            limit: Максимум кандидатов в выдаче

        Returns:
            Места, отсортированные по убыванию населения
        """
        ...

    async def find_places_by_ids(self, *, place_ids: Collection[UUID]) -> tuple[PlaceEntity, ...]:
        """
        Находит места по id; несуществующие id пропускаются.

        Нужен, чтобы отдать названия мест по id и проверить, что места с такими id существуют.

        Args:
            place_ids: Id мест

        Returns:
            Найденные места в произвольном порядке
        """
        ...
