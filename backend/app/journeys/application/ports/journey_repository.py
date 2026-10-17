from collections.abc import Collection
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint
from app.shared.fractional_index import SortKeyRepositoryPort
from app.shared.pagination import CursorPage, PageQuery

__all__ = [
    "JourneyFilters",
    "JourneyOrderScope",
    "JourneyRepositoryPort",
    "MovementConnection",
    "VisitedPlace",
]


@dataclass(frozen=True, slots=True)
class JourneyOrderScope:
    """Область ручного порядка поездок: поездки одного пользователя за один год."""

    user_id: UUID
    traveled_year: int


@dataclass(frozen=True, slots=True)
class JourneyFilters:
    """
    Фильтр ленты поездок.

    Годы — включительно, ``None`` — без границы. ``transport_types`` — виды транспорта, поездки на
    которых учитываются; ``None`` — все.
    """

    year_from: int | None
    year_to: int | None
    transport_types: frozenset[TransportType] | None


@dataclass(frozen=True, slots=True)
class VisitedPlace:
    """
    Место, где пользователь побывал, — строка выдачи репозитория.

    ``years`` — годы всех поездок с местом, по возрастанию.
    """

    place: GeoPoint
    years: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class MovementConnection:
    """
    Стрелка на карте перемещений: откуда и куда пользователь ездил, без повторов.

    ``years`` — годы поездок по этому маршруту, по возрастанию.
    """

    origin: GeoPoint
    destination: GeoPoint
    years: tuple[int, ...]


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
