from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.journeys.application.ports import JourneyRepositoryPort
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import DatePrecision, TransportType
from app.journeys.domain.value_objects import ApproximateDate, GeoPoint
from app.journeys.infra.models import Journey
from app.shared.repositories.base_repository import BaseDBRepository


class JourneyRepository(BaseDBRepository[Journey], JourneyRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session, model=Journey)

    async def insert_journey(self, journey_entity: JourneyEntity) -> None:
        await self.insert(data=self._to_model(journey_entity=journey_entity))

    async def find_journeys_by_user_id(self, *, user_id: UUID) -> list[JourneyEntity]:
        """
        Возвращает все неудалённые поездки пользователя, упорядоченные по дате поездки.

        Soft-deleted записи (``deleted_at IS NOT NULL``) отфильтрованы. Порядок по
        ``traveled_on`` детерминирован для стабильной агрегации карты на стороне сервиса.

        Args:
            user_id: Владелец поездок

        Returns:
            Список доменных сущностей поездок (пустой, если поездок нет)
        """
        query = (
            select(Journey)
            .where(Journey.user_id == user_id, Journey.deleted_at.is_(None))
            .order_by(Journey.traveled_on)
        )
        result = await self._session.execute(query)
        return [self._to_entity(journey_model=journey_model) for journey_model in result.scalars()]

    def _to_entity(self, *, journey_model: Journey) -> JourneyEntity:
        return JourneyEntity(
            journey_id=journey_model.id,
            user_id=journey_model.user_id,
            origin=GeoPoint(
                name=journey_model.origin_name,
                country_code=journey_model.origin_country_code,
                latitude=journey_model.origin_latitude,
                longitude=journey_model.origin_longitude,
            ),
            destination=GeoPoint(
                name=journey_model.destination_name,
                country_code=journey_model.destination_country_code,
                latitude=journey_model.destination_latitude,
                longitude=journey_model.destination_longitude,
            ),
            transport_type=TransportType(journey_model.transport_type),
            traveled_on=ApproximateDate(
                value=journey_model.traveled_on,
                precision=DatePrecision(journey_model.traveled_on_precision),
            ),
            created_at=journey_model.created_at,
            updated_at=journey_model.updated_at,
            deleted_at=journey_model.deleted_at,
        )

    def _to_model(self, journey_entity: JourneyEntity) -> Journey:
        return Journey(
            id=journey_entity.journey_id,
            user_id=journey_entity.user_id,
            origin_name=journey_entity.origin.name,
            origin_country_code=journey_entity.origin.country_code,
            origin_latitude=journey_entity.origin.latitude,
            origin_longitude=journey_entity.origin.longitude,
            destination_name=journey_entity.destination.name,
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
