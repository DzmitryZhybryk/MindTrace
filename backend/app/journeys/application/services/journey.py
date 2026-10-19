from itertools import groupby
from uuid import UUID

from app.journeys.application.ports.journey_repository import JourneyOrderScope
from app.journeys.application.ports.places_client import PlacesClientPort
from app.journeys.application.ports.unit_of_work import JourneyUnitOfWorkPort
from app.journeys.application.schemas.commands import (
    CreateJourneyCommand,
    EstimateJourneyDistanceCommand,
    GetMovementsMapCommand,
    ListJourneysCommand,
    MoveJourneyCommand,
    UpdateJourneyCommand,
)
from app.journeys.application.schemas.results import (
    JourneyDistanceResult,
    JourneyFeedItem,
    JourneysGlobeResult,
    JourneysMapResult,
    JourneyYearsResult,
    ListJourneysResult,
    MapCityVisit,
    MapCountryVisits,
    MoveJourneyResult,
    MovementsMapResult,
)
from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.value_objects import GeoPoint
from app.journeys.exceptions import (
    InvalidMoveTargetError,
    JourneyNotFoundError,
    PlaceWithoutCountryError,
    UnknownPlaceError,
)
from app.shared.fractional_index import MovePlacement, generate_key_between


class JourneyService:
    """Сервис для взаимодействия с путешествиями пользователя."""

    def __init__(self, *, uow: JourneyUnitOfWorkPort, places_client: PlacesClientPort) -> None:
        self._uow = uow
        self._places_client = places_client

    async def create_journey(self, *, user_id: UUID, command: CreateJourneyCommand) -> None:
        """
        Создаёт поездку в конце её года.

        Страну и координаты мест отправления и назначения берёт у geo.

        Args:
            user_id: Владелец поездки
            command: Данные для создания поездки (места, транспорт, год)

        Raises:
            UnknownPlaceError: какого-то из мест нет в справочнике geo; ненайденные id — в
                ``details.place_ids``
            PlaceWithoutCountryError: у какого-то из мест в справочнике нет страны
        """
        origin, destination = await self._find_route_points(
            origin_place_id=command.origin_place_id,
            destination_place_id=command.destination_place_id,
        )
        distance_km = origin.distance_km_to(destination=destination)
        async with self._uow.transaction():
            order_scope = JourneyOrderScope(user_id=user_id, traveled_year=command.traveled_year)
            await self._uow.journey_repository.lock_sort_keys(scope=order_scope)
            last_sort_key = await self._uow.journey_repository.find_last_sort_key(scope=order_scope)
            journey_entity = JourneyEntity.create(
                user_id=user_id,
                origin=origin,
                destination=destination,
                transport_type=command.transport_type,
                distance_km=distance_km,
                traveled_year=command.traveled_year,
                sort_key=generate_key_between(before=last_sort_key, after=None),
            )
            await self._uow.journey_repository.insert_journey(journey_entity=journey_entity)
            await self._uow.commit()

    async def update_journey(self, *, user_id: UUID, journey_id: UUID, command: UpdateJourneyCommand) -> None:
        """
        Заменяет все поля поездки; при смене года поездка встаёт в конец нового года.

        Args:
            user_id: Владелец поездки
            journey_id: Какая поездка
            command: Новые места, транспорт и год

        Raises:
            UnknownPlaceError: какого-то из мест нет в справочнике geo
            PlaceWithoutCountryError: у какого-то из мест в справочнике нет страны
            JourneyNotFoundError: у пользователя нет такой поездки или она удалена
        """
        origin, destination = await self._find_route_points(
            origin_place_id=command.origin_place_id,
            destination_place_id=command.destination_place_id,
        )
        distance_km = origin.distance_km_to(destination=destination)
        async with self._uow.transaction():
            target_scope = JourneyOrderScope(user_id=user_id, traveled_year=command.traveled_year)
            await self._uow.journey_repository.lock_sort_keys(scope=target_scope)
            journey_entity = await self._find_user_journey_for_update(user_id=user_id, journey_id=journey_id)
            journey_entity.revise(
                origin=origin,
                destination=destination,
                transport_type=command.transport_type,
                distance_km=distance_km,
            )
            if journey_entity.traveled_year != command.traveled_year:
                last_sort_key = await self._uow.journey_repository.find_last_sort_key(scope=target_scope)
                journey_entity.move(
                    traveled_year=command.traveled_year,
                    sort_key=generate_key_between(before=last_sort_key, after=None),
                )

            await self._uow.journey_repository.update_journey_by_id(journey_entity=journey_entity)
            await self._uow.commit()

    async def delete_journey(self, *, user_id: UUID, journey_id: UUID) -> None:
        """
        Удаляет поездку (soft-delete, без восстановления).

        Args:
            user_id: Владелец поездки
            journey_id: Какая поездка

        Raises:
            JourneyNotFoundError: у пользователя нет такой поездки или она уже удалена
        """
        async with self._uow.transaction():
            journey_entity = await self._find_user_journey_for_update(user_id=user_id, journey_id=journey_id)
            journey_entity.delete()
            await self._uow.journey_repository.update_journey_by_id(journey_entity=journey_entity)
            await self._uow.commit()

    async def move_journey(self, *, user_id: UUID, journey_id: UUID, command: MoveJourneyCommand) -> MoveJourneyResult:
        """
        Переносит поездку после или перед поездкой-соседом; год берётся от соседа.

        Args:
            user_id: Владелец поездки
            journey_id: Какая поездка
            command: Сосед и с какой стороны от него встать

        Returns:
            Год поездки после переноса

        Raises:
            InvalidMoveTargetError: соседа у пользователя нет, он удалён, это сама переносимая поездка
                или он ушёл в другой год, пока перенос ждал блокировку
            JourneyNotFoundError: у пользователя нет переносимой поездки или она удалена
        """
        async with self._uow.transaction():
            neighbor_entity = await self._uow.journey_repository.find_journey_by_id_and_user_id(
                journey_id=command.neighbor_journey_id,
                user_id=user_id,
            )
            if neighbor_entity is None:
                raise InvalidMoveTargetError()

            target_scope = JourneyOrderScope(user_id=user_id, traveled_year=neighbor_entity.traveled_year)
            await self._uow.journey_repository.lock_sort_keys(scope=target_scope)
            # Пока ждали блокировку года, соседа могли переставить, перенести в другой год или удалить.
            neighbor_entity = await self._uow.journey_repository.find_journey_by_id_and_user_id(
                journey_id=command.neighbor_journey_id,
                user_id=user_id,
            )
            if (
                neighbor_entity is None
                or neighbor_entity.is_deleted
                or neighbor_entity.journey_id == journey_id
                or neighbor_entity.traveled_year != target_scope.traveled_year
            ):
                raise InvalidMoveTargetError()

            journey_entity = await self._find_user_journey_for_update(user_id=user_id, journey_id=journey_id)
            before_sort_key, after_sort_key = await self._find_move_bounds(
                scope=target_scope,
                neighbor_sort_key=neighbor_entity.sort_key,
                placement=command.placement,
            )
            journey_entity.move(
                traveled_year=neighbor_entity.traveled_year,
                sort_key=generate_key_between(before=before_sort_key, after=after_sort_key),
            )
            await self._uow.journey_repository.update_journey_by_id(journey_entity=journey_entity)
            await self._uow.commit()

        return MoveJourneyResult(traveled_year=journey_entity.traveled_year)

    async def estimate_journey_distance(self, command: EstimateJourneyDistanceCommand) -> JourneyDistanceResult:
        """
        Считает расстояние маршрута тем же способом, каким его сохранит поездка.

        Args:
            command: Места концов маршрута

        Returns:
            Расстояние по большой окружности, км

        Raises:
            UnknownPlaceError: какого-то из мест нет в справочнике geo
            PlaceWithoutCountryError: у какого-то из мест в справочнике нет страны
        """
        origin, destination = await self._find_route_points(
            origin_place_id=command.origin_place_id,
            destination_place_id=command.destination_place_id,
        )
        return JourneyDistanceResult(distance_km=origin.distance_km_to(destination=destination))

    async def _find_route_points(
        self, *, origin_place_id: UUID, destination_place_id: UUID
    ) -> tuple[GeoPoint, GeoPoint]:
        """
        Берёт у geo страну и координаты мест отправления и назначения.

        Args:
            origin_place_id: Место отправления
            destination_place_id: Место назначения

        Returns:
            Точки отправления и назначения

        Raises:
            UnknownPlaceError: какого-то из мест нет в справочнике geo; ненайденные id — в
                ``details.place_ids``
            PlaceWithoutCountryError: у какого-то из мест в справочнике нет страны; такие id — в
                ``details.place_ids``
        """
        place_ids = (origin_place_id, destination_place_id)
        # geo отдаёт места в произвольном порядке, поэтому сопоставляем по id, а не по позиции.
        locations = {
            location.place_id: location
            for location in await self._places_client.find_place_locations(place_ids=place_ids)
        }
        missing_place_ids = frozenset(place_ids) - locations.keys()
        if missing_place_ids:
            raise UnknownPlaceError(details={"place_ids": missing_place_ids})

        route_points: list[GeoPoint] = []
        countryless_place_ids: set[UUID] = set()
        for place_id in place_ids:
            location = locations[place_id]
            if location.country_code is None:
                countryless_place_ids.add(place_id)
                continue

            route_points.append(
                GeoPoint(
                    place_id=place_id,
                    country_code=location.country_code,
                    latitude=location.latitude,
                    longitude=location.longitude,
                )
            )

        if countryless_place_ids:
            raise PlaceWithoutCountryError(details={"place_ids": frozenset(countryless_place_ids)})

        origin, destination = route_points
        return origin, destination

    async def _find_user_journey_for_update(self, *, user_id: UUID, journey_id: UUID) -> JourneyEntity:
        """
        Берёт неудалённую поездку пользователя под блокировку строки.

        Args:
            user_id: Владелец поездки
            journey_id: Какая поездка

        Returns:
            Поездка пользователя

        Raises:
            JourneyNotFoundError: у пользователя нет такой поездки или она удалена
        """
        journey_entity = await self._uow.journey_repository.find_journey_by_id_and_user_id_for_update(
            journey_id=journey_id,
            user_id=user_id,
        )
        if journey_entity is None:
            raise JourneyNotFoundError()

        journey_entity.ensure_not_deleted()
        return journey_entity

    async def _find_move_bounds(
        self, *, scope: JourneyOrderScope, neighbor_sort_key: str, placement: MovePlacement
    ) -> tuple[str | None, str | None]:
        """
        Находит ключи, между которыми встаёт переносимая поездка: ключ соседа и ближайший к нему с нужной стороны.

        Args:
            scope: Год пользователя, куда переносится поездка
            neighbor_sort_key: Ключ соседа
            placement: С какой стороны от соседа встать

        Returns:
            Ключи до и после нового места; ``None`` — с этой стороны в году поездок нет
        """
        if placement is MovePlacement.AFTER:
            next_sort_key = await self._uow.journey_repository.find_next_sort_key(
                scope=scope,
                after_sort_key=neighbor_sort_key,
            )
            return neighbor_sort_key, next_sort_key

        previous_sort_key = await self._uow.journey_repository.find_previous_sort_key(
            scope=scope,
            before_sort_key=neighbor_sort_key,
        )
        return previous_sort_key, neighbor_sort_key

    async def list_journeys(self, *, user_id: UUID, command: ListJourneysCommand) -> ListJourneysResult:
        """
        Отдаёт страницу ленты поездок пользователя: свежий год сверху, внутри года — порядок пользователя.

        Args:
            user_id: Владелец поездок
            command: Страница и фильтр

        Returns:
            Поездки страницы и курсор следующей

        Raises:
            InvalidCursorError: курсор не разбирается или выдан другим списком
        """
        journeys_page = await self._uow.journey_repository.find_journeys_page_by_user_id(
            user_id=user_id,
            page=command.page,
            filters=command.filters,
        )
        items = tuple(
            JourneyFeedItem(
                journey_id=journey_entity.journey_id,
                origin=journey_entity.origin,
                destination=journey_entity.destination,
                transport_type=journey_entity.transport_type,
                traveled_year=journey_entity.traveled_year,
                distance_km=journey_entity.distance_km,
            )
            for journey_entity in journeys_page.items
        )
        return ListJourneysResult(items=items, next_cursor=journeys_page.next_cursor)

    async def get_journey_years(self, *, user_id: UUID) -> JourneyYearsResult:
        """
        Отдаёт годы, в которые пользователь ездил, по возрастанию — без учёта фильтров ленты.

        Args:
            user_id: Владелец поездок

        Returns:
            Годы поездок
        """
        years = await self._uow.journey_repository.find_journey_years_by_user_id(user_id=user_id)
        return JourneyYearsResult(years=years)

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

    async def get_movements_map(self, *, user_id: UUID, command: GetMovementsMapCommand) -> MovementsMapResult:
        """
        Собирает карту перемещений: маршруты поездок пользователя с их годами.

        Годы первой и последней поездки считаются по всем поездкам, без фильтра транспорта: по
        ним фронт строит шкалу лет, и она не должна меняться от выбранного транспорта.

        Args:
            user_id: Владелец поездок
            command: Виды транспорта

        Returns:
            Маршруты поездок и годы первой и последней поездки
        """
        years = await self._uow.journey_repository.find_journey_years_by_user_id(user_id=user_id)
        if not years:
            return MovementsMapResult(first_year=None, last_year=None, connections=())

        connections = await self._uow.journey_repository.find_movement_connections_by_user_id(
            user_id=user_id,
            transport_types=command.transport_types,
        )
        return MovementsMapResult(first_year=min(years), last_year=max(years), connections=connections)
