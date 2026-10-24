from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.application.ports.place_repository import PlaceRepositoryPort
from app.geo.application.ports.unit_of_work import GeoUnitOfWorkPort
from app.geo.infra.repositories import PlaceRepository
from app.shared.infra.postgres.uow import BaseUnitOfWork


class GeoUnitOfWork(BaseUnitOfWork, GeoUnitOfWorkPort):
    place_repository: PlaceRepositoryPort

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session=session)
        self.place_repository = PlaceRepository(session=session)
