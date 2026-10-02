"""
Unit-тесты ``JourneyService`` на фейк-UoW.

``create_journey`` — снапшот мест, фиксация, отказ при неизвестных местах.
``get_journeys_map`` / ``get_journeys_globe`` — сборка ответа из мест репозитория.
``get_movements_map`` — маршруты и годы, передача фильтров, пустой ответ без поездок.
"""

from uuid import UUID, uuid4

import pytest

from app.journeys.application.schemas import (
    CreateJourneyCommand,
    GetMovementsMapCommand,
    JourneysMapResult,
    MapCityVisit,
    MapCountryVisits,
    MovementConnection,
    MovementsMapResult,
    VisitedPlace,
)
from app.journeys.application.services import JourneyService
from app.journeys.domain.enums import TransportType
from app.journeys.exceptions import UnknownPlaceError
from tests.builders import LONDON_PLACE_ID, MOSCOW_PLACE_ID, make_geo_point
from tests.fakes import FakeJourneyRepository, FakeJourneyUnitOfWork, FakePlacesClient, MovementConnectionQuery

_MOSCOW = make_geo_point(place_id=MOSCOW_PLACE_ID, country_code="RU", latitude=55.75, longitude=37.62)
_LONDON = make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12)


async def test_create_journey_snapshots_places_and_commits(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    fake_places_client: FakePlacesClient,
) -> None:
    """create_journey: снапшотит места из команды, вставляет поездку с её годом и коммитит один раз."""
    user_id = uuid4()
    command = CreateJourneyCommand(
        user_id=user_id,
        origin=_MOSCOW,
        destination=_LONDON,
        transport_type=TransportType.AIR,
        traveled_year=2020,
    )

    await journey_service.create_journey(command=command)

    assert len(fake_journey_repository.journeys) == 1
    journey = fake_journey_repository.journeys[0]
    assert journey.user_id == user_id
    assert journey.origin.place_id == MOSCOW_PLACE_ID
    assert journey.origin.country_code == "RU"
    assert journey.destination.place_id == LONDON_PLACE_ID
    assert journey.destination.latitude == pytest.approx(51.5)
    assert journey.transport_type is TransportType.AIR
    assert journey.traveled_year == 2020
    assert journey.distance_km == pytest.approx(2500, abs=60)
    fake_journey_uow.commit_mock.assert_awaited_once()
    assert fake_journey_uow.transactions_started == 1
    assert fake_places_client.calls == [(MOSCOW_PLACE_ID, LONDON_PLACE_ID)]


@pytest.mark.parametrize("missing_ids", [(MOSCOW_PLACE_ID,), (LONDON_PLACE_ID,), (MOSCOW_PLACE_ID, LONDON_PLACE_ID)])
async def test_create_journey_unknown_places_rejected_before_transaction(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    fake_places_client: FakePlacesClient,
    missing_ids: tuple[UUID, ...],
) -> None:
    """Неизвестные origin, destination или оба дают точные id ошибки без транзакции и вставки."""
    fake_places_client.existing_place_ids.difference_update(missing_ids)
    command = CreateJourneyCommand(
        user_id=uuid4(),
        origin=_MOSCOW,
        destination=_LONDON,
        transport_type=TransportType.AIR,
        traveled_year=2020,
    )

    with pytest.raises(UnknownPlaceError) as exc_info:
        await journey_service.create_journey(command=command)

    assert exc_info.value.details == {"place_ids": frozenset(missing_ids)}
    assert fake_journey_repository.journeys == []
    assert fake_journey_uow.transactions_started == 0
    fake_journey_uow.commit_mock.assert_not_awaited()
    assert fake_places_client.calls == [(MOSCOW_PLACE_ID, LONDON_PLACE_ID)]


async def test_get_journeys_map_no_journeys_returns_empty(journey_service: JourneyService) -> None:
    """get_journeys_map: у пользователя нет поездок → пустой агрегат без стран."""
    result = await journey_service.get_journeys_map(user_id=uuid4())

    assert result == JourneysMapResult(countries=())


async def test_get_journeys_map_groups_places_by_country(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journeys_map: места, идущие по стране подряд, собираются в страны с городами и годами."""
    user_id = uuid4()
    paris_id = uuid4()
    fake_journey_repository.visited_places_by_user_id[user_id] = [
        VisitedPlace(
            place=make_geo_point(place_id=paris_id, country_code="FR", latitude=48.85, longitude=2.35), years=(2021,)
        ),
        VisitedPlace(place=_LONDON, years=(2019, 2021)),
        VisitedPlace(place=_MOSCOW, years=(2019,)),
    ]

    result = await journey_service.get_journeys_map(user_id=user_id)

    assert result == JourneysMapResult(
        countries=(
            MapCountryVisits(
                country_code="FR",
                cities=(MapCityVisit(place_id=paris_id, latitude=48.85, longitude=2.35, years=(2021,)),),
            ),
            MapCountryVisits(
                country_code="GB",
                cities=(MapCityVisit(place_id=LONDON_PLACE_ID, latitude=51.5, longitude=-0.12, years=(2019, 2021)),),
            ),
            MapCountryVisits(
                country_code="RU",
                cities=(MapCityVisit(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62, years=(2019,)),),
            ),
        )
    )


async def test_get_journeys_map_keeps_several_cities_of_one_country_together(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journeys_map: два города одной страны — одна страна с двумя городами в порядке репозитория."""
    user_id = uuid4()
    petersburg_id = uuid4()
    petersburg = make_geo_point(place_id=petersburg_id, country_code="RU", latitude=59.94, longitude=30.31)
    fake_journey_repository.visited_places_by_user_id[user_id] = [
        VisitedPlace(place=_MOSCOW, years=(2020,)),
        VisitedPlace(place=petersburg, years=(2021,)),
    ]

    result = await journey_service.get_journeys_map(user_id=user_id)

    assert [country.country_code for country in result.countries] == ["RU"]
    assert [city.place_id for city in result.countries[0].cities] == [MOSCOW_PLACE_ID, petersburg_id]


async def test_get_journeys_globe_returns_places_without_years(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journeys_globe: те же места, что у карты, каждое по одному разу."""
    user_id = uuid4()
    fake_journey_repository.visited_places_by_user_id[user_id] = [
        VisitedPlace(place=_LONDON, years=(2019, 2021)),
        VisitedPlace(place=_MOSCOW, years=(2019,)),
    ]

    result = await journey_service.get_journeys_globe(user_id=user_id)

    assert [place.place_id for place in result.places] == [LONDON_PLACE_ID, MOSCOW_PLACE_ID]
    assert result.places[1].latitude == pytest.approx(55.75)


async def test_get_movements_map_returns_connections_and_year_bounds(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_movements_map: маршруты с годами и годы первой и последней поездки; транспорт доходит до запроса."""
    user_id = uuid4()
    connection = MovementConnection(origin=_MOSCOW, destination=_LONDON, years=(2019, 2021))
    fake_journey_repository.year_bounds_by_user_id[user_id] = (2017, 2022)
    fake_journey_repository.movement_connections_by_user_id[user_id] = [connection]
    command = GetMovementsMapCommand(user_id=user_id, transport_types=frozenset({TransportType.AIR}))

    result = await journey_service.get_movements_map(command=command)

    assert result == MovementsMapResult(first_year=2017, last_year=2022, connections=(connection,))
    assert fake_journey_repository.movement_connection_queries == [
        MovementConnectionQuery(user_id=user_id, transport_types=frozenset({TransportType.AIR}))
    ]


async def test_get_movements_map_without_journeys_skips_connections_query(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_movements_map: поездок нет → пустой ответ без годов, маршруты не запрашиваются."""
    user_id = uuid4()
    command = GetMovementsMapCommand(user_id=user_id, transport_types=None)

    result = await journey_service.get_movements_map(command=command)

    assert result == MovementsMapResult(first_year=None, last_year=None, connections=())
    assert fake_journey_repository.movement_connection_queries == []
