"""
Порты (контракты) исходящих зависимостей journeys, которыми пользуется application-слой.

По инверсии зависимостей контракт, на который опирается ``JourneyService``, принадлежит
application-слою, а реализация живёт в ``infra``: репозиторий и UoW — поверх Postgres.
``infra`` импортирует порт отсюда, не наоборот.

На эти же порты опираются in-memory фейки в тестах — ``ty`` ловит расхождение сигнатур
между реальной реализацией и фейком. Зависит только от ``domain`` — модуль остаётся
листом графа импортов без внутренних циклов.

В geo journeys ходит только за одним: проверить при создании поездки, что места существуют
(``PlacesClientPort``).
"""

from collections.abc import Collection
from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from app.journeys.domain.entities import JourneyEntity


class JourneyRepositoryPort(Protocol):
    """Контракт хранилища поездок, на который опирается application-слой."""

    async def insert_journey(self, journey_entity: JourneyEntity) -> None: ...

    async def find_journeys_by_user_id(self, *, user_id: UUID) -> list[JourneyEntity]: ...


class PlacesClientPort(Protocol):
    """Исходящий вызов в geo, справочник мест."""

    async def get_missing_place_ids(self, *, place_ids: Collection[UUID]) -> frozenset[UUID]:
        """
        Возвращает те id из переданных, которых нет в справочнике geo.

        Нужен при создании поездки: места отправления и назначения проверяются одним вызовом,
        чтобы поездка не ссылалась на несуществующее место.

        Args:
            place_ids: Id мест для проверки

        Returns:
            Id ненайденных мест; пусто, если все на месте
        """
        ...


class JourneyUnitOfWorkPort(Protocol):
    """
    Контракт транзакционной границы journeys, на который опирается ``JourneyService``.

    Объединяет доступ к репозиторию (через его порт), транзакционную область
    ``transaction()`` и явный ``commit``. Как и ``UserUnitOfWorkPort``, без
    ``session``-шва: создание поездки не делает atomic-defer procrastinate-таски,
    поэтому raw-сессия в контракте не нужна (YAGNI).
    """

    journey_repository: JourneyRepositoryPort

    def transaction(self) -> AbstractAsyncContextManager[None]: ...

    async def commit(self) -> None: ...
