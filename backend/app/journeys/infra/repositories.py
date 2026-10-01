from collections.abc import Collection
from uuid import UUID

from sqlalchemy import Integer, Subquery, cast, extract, func, select, union_all
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.ext.asyncio import AsyncSession

from app.journeys.application.ports import JourneyRepositoryPort
from app.journeys.application.schemas import MovementConnection, VisitedPlace
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint
from app.journeys.infra.models import Journey
from app.shared.repositories.base_repository import BaseDBRepository


class JourneyRepository(BaseDBRepository[Journey], JourneyRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session, model=Journey)

    async def insert_journey(self, journey_entity: JourneyEntity) -> None:
        await self.insert(data=self._to_model(journey_entity=journey_entity))

    async def find_visited_places_by_user_id(self, *, user_id: UUID) -> list[VisitedPlace]:
        """
        Возвращает места, где пользователь побывал, — по одному на место.

        Soft-deleted поездки не учитываются. Годы — всех поездок с местом, по возрастанию.
        Порядок — по коду страны, затем по ``place_id``.

        Args:
            user_id: Владелец поездок

        Returns:
            Посещённые места (пустой список, если поездок нет)
        """
        visits = self._place_visits(user_id=user_id)
        visit_year = cast(extract("year", visits.c.traveled_on), Integer)
        # Поездки копируют страну и координаты места из справочника, копии одного места могут
        # слегка разойтись после его обновления — берём любую, min() лишь делает выбор стабильным.
        country_code = func.min(visits.c.country_code).label("country_code")
        query = (
            select(
                visits.c.place_id,
                country_code,
                func.min(visits.c.latitude).label("latitude"),
                func.min(visits.c.longitude).label("longitude"),
                func.array_agg(aggregate_order_by(visit_year.distinct(), visit_year)).label("years"),
            )
            .group_by(visits.c.place_id)
            .order_by(country_code, visits.c.place_id)
        )
        result = await self._session.execute(query)
        return [
            VisitedPlace(
                place=GeoPoint(
                    place_id=row.place_id,
                    country_code=row.country_code,
                    latitude=row.latitude,
                    longitude=row.longitude,
                ),
                years=tuple(row.years),
            )
            for row in result
        ]

    async def find_movement_connections_by_user_id(
        self,
        *,
        user_id: UUID,
        transport_types: Collection[TransportType] | None,
    ) -> list[MovementConnection]:
        """
        Возвращает маршруты поездок пользователя — по одному на пару «откуда → куда».

        Учитываются неудалённые поездки на указанных видах транспорта (``None`` — на всех).
        У маршрута — годы его поездок, по возрастанию. Страна и координаты места — любая из его
        копий в поездках маршрута. Порядок — по ``place_id`` отправления, затем назначения.

        Args:
            user_id: Владелец поездок
            transport_types: Виды транспорта, поездки на которых учитываются

        Returns:
            Маршруты с координатами и годами поездок (пустой список, если поездок нет)
        """
        traveled_year = cast(extract("year", Journey.traveled_on), Integer)
        filters = [Journey.user_id == user_id, Journey.deleted_at.is_(None)]
        if transport_types is not None:
            filters.append(Journey.transport_type.in_(transport_types))

        query = (
            select(
                Journey.origin_place_id,
                func.min(Journey.origin_country_code).label("origin_country_code"),
                func.min(Journey.origin_latitude).label("origin_latitude"),
                func.min(Journey.origin_longitude).label("origin_longitude"),
                Journey.destination_place_id,
                func.min(Journey.destination_country_code).label("destination_country_code"),
                func.min(Journey.destination_latitude).label("destination_latitude"),
                func.min(Journey.destination_longitude).label("destination_longitude"),
                func.array_agg(aggregate_order_by(traveled_year.distinct(), traveled_year)).label("years"),
            )
            .where(*filters)
            .group_by(Journey.origin_place_id, Journey.destination_place_id)
            .order_by(Journey.origin_place_id, Journey.destination_place_id)
        )
        result = await self._session.execute(query)
        return [
            MovementConnection(
                origin=GeoPoint(
                    place_id=row.origin_place_id,
                    country_code=row.origin_country_code,
                    latitude=row.origin_latitude,
                    longitude=row.origin_longitude,
                ),
                destination=GeoPoint(
                    place_id=row.destination_place_id,
                    country_code=row.destination_country_code,
                    latitude=row.destination_latitude,
                    longitude=row.destination_longitude,
                ),
                years=tuple(row.years),
            )
            for row in result
        ]

    async def find_journey_year_bounds_by_user_id(self, *, user_id: UUID) -> tuple[int, int] | None:
        """
        Возвращает годы первой и последней неудалённой поездки пользователя.

        Args:
            user_id: Владелец поездок

        Returns:
            Первый и последний год; ``None``, если поездок нет
        """
        query = select(func.min(Journey.traveled_on), func.max(Journey.traveled_on)).where(
            Journey.user_id == user_id,
            Journey.deleted_at.is_(None),
        )
        first_traveled_on, last_traveled_on = (await self._session.execute(query)).one()
        return (first_traveled_on.year, last_traveled_on.year) if first_traveled_on else None

    @staticmethod
    def _place_visits(*, user_id: UUID) -> Subquery:
        """Визиты мест: каждая неудалённая поездка пользователя даёт два — отправление и назначение."""
        is_user_journey = (Journey.user_id == user_id, Journey.deleted_at.is_(None))
        origins = select(
            Journey.origin_place_id.label("place_id"),
            Journey.origin_country_code.label("country_code"),
            Journey.origin_latitude.label("latitude"),
            Journey.origin_longitude.label("longitude"),
            Journey.traveled_on,
        ).where(*is_user_journey)
        destinations = select(
            Journey.destination_place_id,
            Journey.destination_country_code,
            Journey.destination_latitude,
            Journey.destination_longitude,
            Journey.traveled_on,
        ).where(*is_user_journey)
        return union_all(origins, destinations).subquery("visits")

    def _to_model(self, journey_entity: JourneyEntity) -> Journey:
        return Journey(
            id=journey_entity.journey_id,
            user_id=journey_entity.user_id,
            origin_place_id=journey_entity.origin.place_id,
            origin_country_code=journey_entity.origin.country_code,
            origin_latitude=journey_entity.origin.latitude,
            origin_longitude=journey_entity.origin.longitude,
            destination_place_id=journey_entity.destination.place_id,
            destination_country_code=journey_entity.destination.country_code,
            destination_latitude=journey_entity.destination.latitude,
            destination_longitude=journey_entity.destination.longitude,
            transport_type=journey_entity.transport_type,
            distance_km=journey_entity.distance_km,
            traveled_on=journey_entity.traveled_on.value,
            traveled_on_precision=journey_entity.traveled_on.precision,
            created_at=journey_entity.created_at,
            updated_at=journey_entity.updated_at,
            deleted_at=journey_entity.deleted_at,
        )
