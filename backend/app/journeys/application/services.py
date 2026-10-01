from itertools import groupby
from uuid import UUID

from app.journeys.application.ports import JourneyUnitOfWorkPort, PlacesClientPort
from app.journeys.application.schemas import (
    CreateJourneyCommand,
    GetMovementsMapCommand,
    JourneysGlobeResult,
    JourneysMapResult,
    MapCityVisit,
    MapCountryVisits,
    MovementsMapResult,
)
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.value_objects import ApproximateDate
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
            origin=command.origin,
            destination=command.destination,
            transport_type=command.transport_type,
            traveled_on=traveled_on,
        )
        # Вызов в geo — до транзакции journeys, чтобы при вынесении geo в сервис сетевой вызов не попал
        # внутрь tx. Пока geo в том же процессе, его SELECT идёт в общей сессии запроса и уже открывает
        # ту транзакцию, которую фиксирует commit ниже.
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
            Посещённые страны (по коду) с городами и годами визитов
        """
        visited_places = await self._uow.journey_repository.find_visited_places_by_user_id(user_id=user_id)
        # Репозиторий отдаёт места упорядоченными по стране — groupby собирает каждую страну целиком.
        countries = tuple(
            MapCountryVisits(
                country_code=country_code,
                cities=tuple(
                    MapCityVisit(
                        place_id=visited_place.place.place_id,
                        latitude=visited_place.place.latitude,
                        longitude=visited_place.place.longitude,
                        years=visited_place.years,
                    )
                    for visited_place in country_places
                ),
            )
            for country_code, country_places in groupby(
                visited_places, key=lambda visited_place: visited_place.place.country_code
            )
        )
        return JourneysMapResult(countries=countries)

    async def get_journeys_globe(self, *, user_id: UUID) -> JourneysGlobeResult:
        """
        Собирает места для глобуса: где пользователь побывал, каждое место по одному разу.

        Args:
            user_id: Владелец поездок

        Returns:
            Посещённые места с координатами
        """
        visited_places = await self._uow.journey_repository.find_visited_places_by_user_id(user_id=user_id)
        return JourneysGlobeResult(places=tuple(visited_place.place for visited_place in visited_places))

    async def get_movements_map(self, command: GetMovementsMapCommand) -> MovementsMapResult:
        """
        Собирает карту перемещений: маршруты поездок пользователя с их годами.

        Годы первой и последней поездки считаются по всем поездкам, без фильтра транспорта: по
        ним фронт строит шкалу лет, и она не должна меняться от выбранного транспорта.

        Args:
            command: Владелец поездок и виды транспорта

        Returns:
            Маршруты поездок и годы первой и последней поездки
        """
        year_bounds = await self._uow.journey_repository.find_journey_year_bounds_by_user_id(user_id=command.user_id)
        if year_bounds is None:
            return MovementsMapResult(first_year=None, last_year=None, connections=())

        first_year, last_year = year_bounds
        connections = await self._uow.journey_repository.find_movement_connections_by_user_id(
            user_id=command.user_id,
            transport_types=command.transport_types,
        )
        return MovementsMapResult(first_year=first_year, last_year=last_year, connections=tuple(connections))
