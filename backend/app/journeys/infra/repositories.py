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

    async def insert_journey(self, journey: JourneyEntity) -> None:
        await self.insert(data=self._to_model(journey=journey))

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
        return [self._to_entity(model=model) for model in result.scalars()]

    def _to_entity(self, *, model: Journey) -> JourneyEntity:
        return JourneyEntity(
            journey_id=model.id,
            user_id=model.user_id,
            origin=GeoPoint(
                name=model.origin_name,
                country_code=model.origin_country_code,
                latitude=model.origin_latitude,
                longitude=model.origin_longitude,
            ),
            destination=GeoPoint(
                name=model.destination_name,
                country_code=model.destination_country_code,
                latitude=model.destination_latitude,
                longitude=model.destination_longitude,
            ),
            transport_type=TransportType(model.transport_type),
            traveled_on=ApproximateDate(
                value=model.traveled_on,
                precision=DatePrecision(model.traveled_on_precision),
            ),
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
        )

    def _to_model(self, journey: JourneyEntity) -> Journey:
        return Journey(
            id=journey.journey_id,
            user_id=journey.user_id,
            origin_name=journey.origin.name,
            origin_country_code=journey.origin.country_code,
            origin_latitude=journey.origin.latitude,
            origin_longitude=journey.origin.longitude,
            destination_name=journey.destination.name,
            destination_country_code=journey.destination.country_code,
            destination_latitude=journey.destination.latitude,
            destination_longitude=journey.destination.longitude,
            transport_type=journey.transport_type,
            distance_km=journey.distance_km,
            traveled_on=journey.traveled_on.value,
            traveled_on_precision=journey.traveled_on.precision,
            created_at=journey.created_at,
            updated_at=journey.updated_at,
            deleted_at=journey.deleted_at,
        )
