from sqlalchemy.ext.asyncio import AsyncSession

from app.journeys.application.ports import JourneyRepositoryPort
from app.journeys.domain.entities import JourneyEntity
from app.journeys.infra.models import Journey
from app.shared.repositories.base_repository import BaseDBRepository


class JourneyRepository(BaseDBRepository[Journey], JourneyRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session, model=Journey)

    async def insert_journey(self, journey: JourneyEntity) -> None:
        await self.insert(data=self._to_model(journey=journey))

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
