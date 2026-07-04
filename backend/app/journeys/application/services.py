from collections import defaultdict
from uuid import UUID

from app.journeys.application.ports import JourneyUnitOfWorkPort
from app.journeys.application.schemas import (
    CityVisitAccumulator,
    CreateJourneyCommand,
    JourneysMapResult,
    MapCityVisit,
    MapCountryVisits,
    PlaceSnapshot,
    VisitsByCity,
    VisitsByCountry,
)
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.value_objects import ApproximateDate, GeoPoint


class JourneyService:
    """Сервис для взаимодействия с путешествиями пользователя."""

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

    async def get_journeys_map(self, *, user_id: UUID) -> JourneysMapResult:
        """
        Собирает агрегат карты путешествий: посещённые страны с городами и годами визитов.

        Поездка origin→destination считает посещёнными оба города (был и там, и там), год
        визита — год поездки. Города схлопываются по ``(country_code, имя)`` в одну точку,
        годы накапливаются уникально и сортируются по возрастанию. Чтение без транзакции.

        Args:
            user_id: Владелец поездок

        Returns:
            Посещённые страны (отсортированы по коду) с городами (по имени) и годами
        """
        journeys = await self._uow.journey_repository.find_journeys_by_user_id(user_id=user_id)

        visits_by_country: VisitsByCountry = defaultdict(dict)
        for journey in journeys:
            year = journey.traveled_on.value.year
            for point in (journey.origin, journey.destination):
                cities = visits_by_country[point.country_code]
                folded_name = point.name.casefold()
                visit = cities.get(folded_name)
                if visit is None:
                    visit = CityVisitAccumulator(point=point)
                    cities[folded_name] = visit

                visit.years.add(year)

        countries = tuple(
            MapCountryVisits(country_code=country_code, cities=self._to_map_cities(visits=cities))
            for country_code, cities in sorted(visits_by_country.items())
        )
        return JourneysMapResult(countries=countries)

    @staticmethod
    def _to_map_cities(*, visits: VisitsByCity) -> tuple[MapCityVisit, ...]:
        """Собирает города страны в отсортированный по имени кортеж DTO карты."""
        cities = (
            MapCityVisit(
                name=visit.point.name,
                latitude=visit.point.latitude,
                longitude=visit.point.longitude,
                years=tuple(sorted(visit.years)),
            )
            for visit in visits.values()
        )
        return tuple(sorted(cities, key=lambda city: city.name.casefold()))

    @staticmethod
    def _to_geo_point(*, point: PlaceSnapshot) -> GeoPoint:
        """Собирает доменный снапшот точки ``GeoPoint`` из входного DTO ``PlaceSnapshot``."""
        return GeoPoint(
            name=point.name,
            country_code=point.country_code,
            latitude=point.latitude,
            longitude=point.longitude,
        )
