from app.journeys.application.ports import JourneyUnitOfWorkPort
from app.journeys.application.schemas import CreateJourneyCommand, PlaceSnapshot
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.value_objects import ApproximateDate, GeoPoint


class JourneyService:
    """Сервис создания поездок."""

    def __init__(self, *, uow: JourneyUnitOfWorkPort) -> None:
        self._uow = uow

    async def create_journey(self, command: CreateJourneyCommand) -> None:
        """
        Создаёт поездку: снапшотит места из тела запроса, нормализует дату, сохраняет.

        Места берутся из тела запроса как есть (payload-on-create), к справочнику geo
        сервис не ходит. Дата собирается и валидируется в ``ApproximateDate``, инвариант
        «origin ≠ destination» и расчёт расстояния — в ``JourneyEntity``. Запись фиксируется
        одним commit'ом.

        Args:
            command: Данные для создания поездки (места, транспорт, дата)
        """
        traveled_on = ApproximateDate.from_parts(
            year=command.traveled_year,
            month=command.traveled_month,
            day=command.traveled_day,
        )
        journey = JourneyEntity.create(
            user_id=command.user_id,
            origin=self._to_geo_point(point=command.origin),
            destination=self._to_geo_point(point=command.destination),
            transport_type=command.transport_type,
            traveled_on=traveled_on,
        )
        async with self._uow.transaction():
            await self._uow.journey_repository.insert_journey(journey=journey)
            await self._uow.commit()

    @staticmethod
    def _to_geo_point(*, point: PlaceSnapshot) -> GeoPoint:
        """Собирает доменный снапшот точки ``GeoPoint`` из входного DTO ``PlaceSnapshot``."""
        return GeoPoint(
            name=point.name,
            country_code=point.country_code,
            latitude=point.latitude,
            longitude=point.longitude,
        )
