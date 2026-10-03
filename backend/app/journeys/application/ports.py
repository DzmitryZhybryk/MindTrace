"""
Порты (контракты) исходящих зависимостей journeys, которыми пользуется application-слой.

По инверсии зависимостей контракт, на который опирается ``JourneyService``, принадлежит
application-слою, а реализация живёт в ``infra``: репозиторий и UoW — поверх Postgres.
``infra`` импортирует порт отсюда, не наоборот.

На эти же порты опираются in-memory фейки в тестах — ``ty`` ловит расхождение сигнатур
между реальной реализацией и фейком. Зависит только от ``domain`` и типов выдачи из
``application.schemas`` — модуль остаётся листом графа импортов без внутренних циклов.

В geo journeys ходит только за одним: проверить при создании поездки, что места существуют
(``PlacesClientPort``).
"""

from collections.abc import Collection
from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from app.journeys.application.schemas import JourneyFilters, JourneyOrderScope, MovementConnection, VisitedPlace
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import TransportType
from app.shared.fractional_index import SortKeyRepositoryPort
from app.shared.pagination import CursorPage, PageQuery


class JourneyRepositoryPort(SortKeyRepositoryPort[JourneyOrderScope], Protocol):
    """
    Контракт хранилища поездок, на который опирается application-слой.

    Чтения ручного порядка (``lock_sort_keys``, ``find_*_sort_key``) наследуются от общего порта;
    их область — ``JourneyOrderScope``: поездки пользователя за год.
    """

    async def insert_journey(self, journey_entity: JourneyEntity) -> None: ...

    async def update_journey_by_id(self, journey_entity: JourneyEntity) -> None: ...

    async def find_journey_by_id_and_user_id_for_update(
        self,
        *,
        journey_id: UUID,
        user_id: UUID,
    ) -> JourneyEntity | None:
        """
        Находит поездку пользователя по id и блокирует строку до конца транзакции.

        Чужая поездка не находится. Удалённая находится — что с ней делать, решает вызывающий.

        Args:
            journey_id: Id поездки
            user_id: Владелец поездки

        Returns:
            Поездка; ``None``, если у пользователя такой нет
        """
        ...

    async def find_journey_by_id_and_user_id(self, *, journey_id: UUID, user_id: UUID) -> JourneyEntity | None:
        """
        Находит поездку пользователя по id, без блокировки.

        Чужая поездка не находится. Удалённая находится — что с ней делать, решает вызывающий.

        Args:
            journey_id: Id поездки
            user_id: Владелец поездки

        Returns:
            Поездка; ``None``, если у пользователя такой нет
        """
        ...

    async def find_visited_places_by_user_id(self, *, user_id: UUID) -> tuple[VisitedPlace, ...]:
        """
        Возвращает места, где пользователь побывал, — по одному на место.

        Место — отправление или назначение любой неудалённой поездки пользователя. Порядок —
        по коду страны, внутри страны по ``place_id``: места одной страны идут подряд.

        Args:
            user_id: Владелец поездок

        Returns:
            Места со страной, координатами и годами визитов
        """
        ...

    async def find_movement_connections_by_user_id(
        self,
        *,
        user_id: UUID,
        transport_types: Collection[TransportType] | None,
    ) -> tuple[MovementConnection, ...]:
        """
        Возвращает маршруты поездок пользователя — по одному на пару «откуда → куда».

        Учитываются неудалённые поездки на указанных видах транспорта (``None`` — на всех).
        У маршрута — годы его поездок, по возрастанию. Порядок — по ``place_id`` отправления,
        затем назначения.

        Args:
            user_id: Владелец поездок
            transport_types: Виды транспорта, поездки на которых учитываются

        Returns:
            Маршруты с координатами отправления и назначения и годами поездок
        """
        ...

    async def find_journeys_page_by_user_id(
        self,
        *,
        user_id: UUID,
        page: PageQuery,
        filters: JourneyFilters,
    ) -> CursorPage[JourneyEntity]:
        """
        Возвращает страницу ленты неудалённых поездок пользователя под фильтром.

        Порядок — свежий год сверху, внутри года — по ключу порядка.

        Args:
            user_id: Владелец поездок
            page: Курсор и размер страницы
            filters: Годы и виды транспорта

        Returns:
            Поездки страницы и курсор следующей

        Raises:
            InvalidCursorError: курсор не разбирается или выдан другим списком
        """
        ...

    async def find_journey_years_by_user_id(self, user_id: UUID) -> tuple[int, ...]:
        """
        Возвращает годы неудалённых поездок пользователя, по возрастанию, без повторов.

        Args:
            user_id: Владелец поездок

        Returns:
            Годы поездок; пусто, если поездок нет
        """
        ...


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
