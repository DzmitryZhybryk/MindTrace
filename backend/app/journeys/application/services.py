from collections import defaultdict
from uuid import UUID

from app.journeys.application.ports import JourneyUnitOfWorkPort, PlacesClientPort
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
from app.journeys.exceptions import UnknownPlaceError


class JourneyService:
    """Сервис для взаимодействия с путешествиями пользователя."""

    def __init__(self, *, uow: JourneyUnitOfWorkPort, places_client: PlacesClientPort) -> None:
        self._uow = uow
        self._places_client = places_client

    async def create_journey(self, command: CreateJourneyCommand) -> None:
        """
        Создаёт поездку.

        Перед сохранением спрашивает у geo, существуют ли места отправления и назначения.

        Args:
            command: Данные для создания поездки (места, транспорт, дата)

        Raises:
            UnknownPlaceError: какого-то из мест нет в справочнике geo; ненайденные id — в
                ``details.place_ids``
        """
        traveled_on = ApproximateDate.from_parts(
            year=command.traveled_year,
            month=command.traveled_month,
            day=command.traveled_day,
        )
        journey_entity = JourneyEntity.create(
            user_id=command.user_id,
            origin=self._to_geo_point(point=command.origin),
            destination=self._to_geo_point(point=command.destination),
            transport_type=command.transport_type,
            traveled_on=traveled_on,
        )
        # Вызов в geo — до транзакции: не держим соединение открытым, пока ждём ответ.
        missing_place_ids = await self._places_client.get_missing_place_ids(
            place_ids=(journey_entity.origin.place_id, journey_entity.destination.place_id),
        )
        if missing_place_ids:
            raise UnknownPlaceError(details={"place_ids": missing_place_ids})

        async with self._uow.transaction():
            await self._uow.journey_repository.insert_journey(journey_entity=journey_entity)
            await self._uow.commit()

    async def get_journeys_map(self, *, user_id: UUID) -> JourneysMapResult:
        """
        Собирает агрегат карты путешествий: посещённые страны с городами и годами визитов.

        В поездке посещёнными считаются оба города — и отправления, и назначения, а год визита —
        год поездки. Один и тот же город из разных поездок становится одной точкой.

        Args:
            user_id: Владелец поездок

        Returns:
            Посещённые страны (по коду) с городами (в порядке первого визита) и годами визитов
        """
        journeys = await self._uow.journey_repository.find_journeys_by_user_id(user_id=user_id)

        visits_by_country: VisitsByCountry = defaultdict(dict)
        for journey_entity in journeys:
            year = journey_entity.traveled_on.value.year
            for point in (journey_entity.origin, journey_entity.destination):
                cities = visits_by_country[point.country_code]
                visit = cities.get(point.place_id)
                if visit is None:
                    visit = CityVisitAccumulator(point=point)
                    cities[point.place_id] = visit

                visit.years.add(year)

        countries = tuple(
            MapCountryVisits(country_code=country_code, cities=self._to_map_cities(visits=cities))
            for country_code, cities in sorted(visits_by_country.items())
        )
        return JourneysMapResult(countries=countries)

    @staticmethod
    def _to_map_cities(*, visits: VisitsByCity) -> tuple[MapCityVisit, ...]:
        """Собирает города страны в кортеж DTO карты в порядке первого визита."""
        return tuple(
            MapCityVisit(
                place_id=place_id,
                latitude=visit.point.latitude,
                longitude=visit.point.longitude,
                years=tuple(sorted(visit.years)),
            )
            for place_id, visit in visits.items()
        )

    @staticmethod
    def _to_geo_point(*, point: PlaceSnapshot) -> GeoPoint:
        """Собирает доменную точку маршрута из входного DTO."""
        return GeoPoint(
            place_id=point.place_id,
            country_code=point.country_code,
            latitude=point.latitude,
            longitude=point.longitude,
        )
