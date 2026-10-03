"""
Unit-тесты ``JourneyService`` на фейк-UoW.

``create_journey`` — снапшот мест, фиксация, отказ при неизвестных местах.
``get_journeys_map`` / ``get_journeys_globe`` — сборка ответа из мест репозитория.
``get_movements_map`` — маршруты и годы, передача фильтров, пустой ответ без поездок.
``update_journey`` / ``delete_journey`` / ``move_journey`` — порядок внутри года, смена года,
недоступные поездки и соседи. ``list_journeys`` / ``get_journey_years`` — лента и годы.
"""

import datetime as dt
from uuid import UUID, uuid4

import pytest

from app.journeys.application.schemas import (
    CreateJourneyCommand,
    DeleteJourneyCommand,
    EstimateJourneyDistanceCommand,
    GetMovementsMapCommand,
    JourneyFeedItem,
    JourneyFilters,
    JourneysMapResult,
    JourneyYearsResult,
    ListJourneysCommand,
    MapCityVisit,
    MapCountryVisits,
    MoveJourneyCommand,
    MoveJourneyResult,
    MovementConnection,
    MovementsMapResult,
    UpdateJourneyCommand,
    VisitedPlace,
)
from app.journeys.application.services import JourneyService
from app.journeys.domain.enums import TransportType
from app.journeys.exceptions import InvalidMoveTargetError, JourneyNotFoundError, UnknownPlaceError
from app.shared.fractional_index import MovePlacement
from app.shared.pagination import PageQuery
from tests.builders import LONDON_PLACE_ID, MOSCOW_PLACE_ID, make_geo_point, make_journey
from tests.fakes import FakeJourneyRepository, FakeJourneyUnitOfWork, FakePlacesClient, MovementConnectionQuery

_MOSCOW = make_geo_point(place_id=MOSCOW_PLACE_ID, country_code="RU", latitude=55.75, longitude=37.62)
_LONDON = make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12)
_DELETED_AT = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)


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
    fake_journey_repository.journeys = [
        make_journey(user_id=user_id, traveled_year=2019),
        make_journey(user_id=user_id, traveled_year=2022),
        make_journey(user_id=user_id, traveled_year=2017),
    ]
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


async def test_create_journey_goes_to_end_of_its_year(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """create_journey: новая поездка — после неудалённых поездок своего года; другие годы и удалённые не мешают."""
    user_id = uuid4()
    fake_journey_repository.journeys = [
        make_journey(user_id=user_id, traveled_year=2020, sort_key="m"),
        make_journey(user_id=user_id, traveled_year=2020, sort_key="z", deleted_at=_DELETED_AT),
        make_journey(user_id=user_id, traveled_year=2021, sort_key="y"),
    ]
    command = CreateJourneyCommand(
        user_id=user_id,
        origin=_MOSCOW,
        destination=_LONDON,
        transport_type=TransportType.AIR,
        traveled_year=2020,
    )

    await journey_service.create_journey(command=command)

    created = fake_journey_repository.journeys[-1]
    assert "m" < created.sort_key < "z"


async def test_update_journey_same_year_replaces_fields_and_keeps_place(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """update_journey: тот же год — места, транспорт и пересчитанное расстояние новые, ключ прежний."""
    user_id = uuid4()
    journey_entity = make_journey(
        user_id=user_id,
        origin=_LONDON,
        destination=_MOSCOW,
        transport_type=TransportType.WATER,
        distance_km=1,
        traveled_year=2020,
        sort_key="m",
    )
    fake_journey_repository.journeys = [journey_entity]

    await journey_service.update_journey(
        command=UpdateJourneyCommand(
            user_id=user_id,
            journey_id=journey_entity.journey_id,
            origin=_MOSCOW,
            destination=_LONDON,
            transport_type=TransportType.AIR,
            traveled_year=2020,
        )
    )

    updated = fake_journey_repository.journeys[0]
    assert updated.origin.place_id == MOSCOW_PLACE_ID
    assert updated.destination.place_id == LONDON_PLACE_ID
    assert updated.transport_type is TransportType.AIR
    assert updated.distance_km == pytest.approx(2500, abs=60)
    assert updated.traveled_year == 2020
    assert updated.sort_key == "m"
    fake_journey_uow.commit_mock.assert_awaited_once()


async def test_update_journey_new_year_goes_to_end_of_that_year(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """update_journey: смена года — поездка встаёт в конец нового года."""
    user_id = uuid4()
    journey_entity = make_journey(user_id=user_id, traveled_year=2020, sort_key="m")
    fake_journey_repository.journeys = [
        journey_entity,
        make_journey(user_id=user_id, traveled_year=2018, sort_key="t"),
    ]

    await journey_service.update_journey(
        command=UpdateJourneyCommand(
            user_id=user_id,
            journey_id=journey_entity.journey_id,
            origin=_MOSCOW,
            destination=_LONDON,
            transport_type=TransportType.AIR,
            traveled_year=2018,
        )
    )

    updated = fake_journey_repository.journeys[0]
    assert updated.traveled_year == 2018
    assert updated.sort_key > "t"


@pytest.mark.parametrize("case", ["missing", "foreign", "deleted"])
async def test_update_journey_unavailable_journey_raises_not_found(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    case: str,
) -> None:
    """update_journey: несуществующая, чужая или удалённая поездка → JourneyNotFoundError без коммита."""
    user_id = uuid4()
    journey_entity = make_journey(
        user_id=uuid4() if case == "foreign" else user_id,
        deleted_at=_DELETED_AT if case == "deleted" else None,
    )
    if case != "missing":
        fake_journey_repository.journeys = [journey_entity]

    with pytest.raises(JourneyNotFoundError):
        await journey_service.update_journey(
            command=UpdateJourneyCommand(
                user_id=user_id,
                journey_id=journey_entity.journey_id,
                origin=_MOSCOW,
                destination=_LONDON,
                transport_type=TransportType.AIR,
                traveled_year=2020,
            )
        )

    fake_journey_uow.commit_mock.assert_not_awaited()


async def test_update_journey_unknown_places_rejected_before_transaction(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    fake_places_client: FakePlacesClient,
) -> None:
    """update_journey: места нет в geo → UnknownPlaceError с его id, транзакция не начиналась."""
    user_id = uuid4()
    journey_entity = make_journey(user_id=user_id)
    fake_journey_repository.journeys = [journey_entity]
    fake_places_client.existing_place_ids.discard(LONDON_PLACE_ID)

    with pytest.raises(UnknownPlaceError) as exc_info:
        await journey_service.update_journey(
            command=UpdateJourneyCommand(
                user_id=user_id,
                journey_id=journey_entity.journey_id,
                origin=_MOSCOW,
                destination=_LONDON,
                transport_type=TransportType.AIR,
                traveled_year=2020,
            )
        )

    assert exc_info.value.details == {"place_ids": frozenset({LONDON_PLACE_ID})}
    assert fake_journey_uow.transactions_started == 0


async def test_delete_journey_soft_deletes_and_commits(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """delete_journey: поездка помечена удалённой и закоммичена."""
    user_id = uuid4()
    journey_entity = make_journey(user_id=user_id)
    fake_journey_repository.journeys = [journey_entity]

    await journey_service.delete_journey(
        command=DeleteJourneyCommand(journey_id=journey_entity.journey_id, user_id=user_id)
    )

    assert fake_journey_repository.journeys[0].is_deleted
    fake_journey_uow.commit_mock.assert_awaited_once()


@pytest.mark.parametrize("case", ["missing", "foreign", "deleted"])
async def test_delete_journey_unavailable_journey_raises_not_found(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    case: str,
) -> None:
    """delete_journey: несуществующая, чужая или уже удалённая поездка → JourneyNotFoundError без коммита."""
    user_id = uuid4()
    journey_entity = make_journey(
        user_id=uuid4() if case == "foreign" else user_id,
        deleted_at=_DELETED_AT if case == "deleted" else None,
    )
    if case != "missing":
        fake_journey_repository.journeys = [journey_entity]

    with pytest.raises(JourneyNotFoundError):
        await journey_service.delete_journey(
            command=DeleteJourneyCommand(journey_id=journey_entity.journey_id, user_id=user_id)
        )

    fake_journey_uow.commit_mock.assert_not_awaited()


@pytest.mark.parametrize(
    ("neighbor_key", "placement", "lower", "upper"),
    [
        ("m", MovePlacement.AFTER, "m", "t"),
        ("m", MovePlacement.BEFORE, "c", "m"),
        ("t", MovePlacement.AFTER, "t", None),
        ("c", MovePlacement.BEFORE, None, "c"),
    ],
)
async def test_move_journey_places_key_between_neighbor_and_next_in_year(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    neighbor_key: str,
    placement: MovePlacement,
    lower: str | None,
    upper: str | None,
) -> None:
    """move_journey: ключ строго между соседом и следующей строкой года с его стороны; на краю года — у края."""
    user_id = uuid4()
    year_entities = {key: make_journey(user_id=user_id, traveled_year=2020, sort_key=key) for key in ("c", "m", "t")}
    moved_entity = make_journey(user_id=user_id, traveled_year=2020, sort_key="x")
    fake_journey_repository.journeys = [*year_entities.values(), moved_entity]

    result = await journey_service.move_journey(
        command=MoveJourneyCommand(
            journey_id=moved_entity.journey_id,
            user_id=user_id,
            neighbor_journey_id=year_entities[neighbor_key].journey_id,
            placement=placement,
        )
    )

    assert result == MoveJourneyResult(traveled_year=2020)
    assert lower is None or moved_entity.sort_key > lower
    assert upper is None or moved_entity.sort_key < upper
    fake_journey_uow.commit_mock.assert_awaited_once()


async def test_move_journey_into_another_year_takes_neighbor_year(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """move_journey: сосед из другого года — поездка получает его год, ключ — после соседа."""
    user_id = uuid4()
    neighbor_entity = make_journey(user_id=user_id, traveled_year=2018, sort_key="m")
    moved_entity = make_journey(user_id=user_id, traveled_year=2020, sort_key="m")
    fake_journey_repository.journeys = [neighbor_entity, moved_entity]

    result = await journey_service.move_journey(
        command=MoveJourneyCommand(
            journey_id=moved_entity.journey_id,
            user_id=user_id,
            neighbor_journey_id=neighbor_entity.journey_id,
            placement=MovePlacement.AFTER,
        )
    )

    assert result == MoveJourneyResult(traveled_year=2018)
    assert moved_entity.traveled_year == 2018
    assert moved_entity.sort_key > "m"


@pytest.mark.parametrize("case", ["missing", "foreign", "deleted", "self"])
async def test_move_journey_invalid_neighbor_raises_invalid_move_target(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    case: str,
) -> None:
    """move_journey: сосед несуществующий, чужой, удалённый или сама поездка → InvalidMoveTargetError без коммита."""
    user_id = uuid4()
    moved_entity = make_journey(user_id=user_id, sort_key="m")
    neighbor_entity = make_journey(
        user_id=uuid4() if case == "foreign" else user_id,
        deleted_at=_DELETED_AT if case == "deleted" else None,
    )
    fake_journey_repository.journeys = [moved_entity] if case == "missing" else [moved_entity, neighbor_entity]
    neighbor_journey_id = moved_entity.journey_id if case == "self" else neighbor_entity.journey_id

    with pytest.raises(InvalidMoveTargetError):
        await journey_service.move_journey(
            command=MoveJourneyCommand(
                journey_id=moved_entity.journey_id,
                user_id=user_id,
                neighbor_journey_id=neighbor_journey_id,
                placement=MovePlacement.AFTER,
            )
        )

    assert moved_entity.sort_key == "m"
    fake_journey_uow.commit_mock.assert_not_awaited()


async def test_move_journey_neighbor_repositioned_while_waiting_for_lock_uses_its_fresh_key(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """move_journey: соседа переставили, пока ждали блокировку года, — поездка встаёт рядом с его новым местом."""
    user_id = uuid4()
    neighbor_entity = make_journey(user_id=user_id, traveled_year=2020, sort_key="c")
    other_entity = make_journey(user_id=user_id, traveled_year=2020, sort_key="m")
    moved_entity = make_journey(user_id=user_id, traveled_year=2019, sort_key="m")
    fake_journey_repository.journeys = [neighbor_entity, other_entity, moved_entity]
    fake_journey_repository.journeys_after_lock = [
        make_journey(journey_id=neighbor_entity.journey_id, user_id=user_id, traveled_year=2020, sort_key="t"),
        other_entity,
        moved_entity,
    ]

    await journey_service.move_journey(
        command=MoveJourneyCommand(
            journey_id=moved_entity.journey_id,
            user_id=user_id,
            neighbor_journey_id=neighbor_entity.journey_id,
            placement=MovePlacement.AFTER,
        )
    )

    assert moved_entity.traveled_year == 2020
    assert moved_entity.sort_key > "t"


@pytest.mark.parametrize("case", ["another_year", "deleted"])
async def test_move_journey_neighbor_gone_while_waiting_for_lock_raises_invalid_move_target(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    case: str,
) -> None:
    """move_journey: соседа унесли в другой год или удалили, пока ждали блокировку, → InvalidMoveTargetError."""
    user_id = uuid4()
    neighbor_entity = make_journey(user_id=user_id, traveled_year=2020, sort_key="c")
    moved_entity = make_journey(user_id=user_id, traveled_year=2019, sort_key="m")
    fake_journey_repository.journeys = [neighbor_entity, moved_entity]
    fake_journey_repository.journeys_after_lock = [
        make_journey(
            journey_id=neighbor_entity.journey_id,
            user_id=user_id,
            traveled_year=2018 if case == "another_year" else 2020,
            sort_key="c",
            deleted_at=_DELETED_AT if case == "deleted" else None,
        ),
        moved_entity,
    ]

    with pytest.raises(InvalidMoveTargetError):
        await journey_service.move_journey(
            command=MoveJourneyCommand(
                journey_id=moved_entity.journey_id,
                user_id=user_id,
                neighbor_journey_id=neighbor_entity.journey_id,
                placement=MovePlacement.AFTER,
            )
        )

    assert (moved_entity.traveled_year, moved_entity.sort_key) == (2019, "m")
    fake_journey_uow.commit_mock.assert_not_awaited()


@pytest.mark.parametrize("case", ["missing", "deleted"])
async def test_move_journey_unavailable_journey_raises_not_found(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    case: str,
) -> None:
    """move_journey: переносимой поездки нет или она удалена → JourneyNotFoundError без коммита."""
    user_id = uuid4()
    neighbor_entity = make_journey(user_id=user_id)
    moved_entity = make_journey(user_id=user_id, deleted_at=_DELETED_AT)
    fake_journey_repository.journeys = [neighbor_entity] if case == "missing" else [neighbor_entity, moved_entity]

    with pytest.raises(JourneyNotFoundError):
        await journey_service.move_journey(
            command=MoveJourneyCommand(
                journey_id=moved_entity.journey_id,
                user_id=user_id,
                neighbor_journey_id=neighbor_entity.journey_id,
                placement=MovePlacement.BEFORE,
            )
        )

    fake_journey_uow.commit_mock.assert_not_awaited()


async def test_list_journeys_maps_page_items_and_cursor(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """list_journeys: строки страницы — поля поездок в порядке ленты, курсор следующей страницы передан."""
    user_id = uuid4()
    newer = make_journey(user_id=user_id, traveled_year=2021, sort_key="a", distance_km=10)
    older = make_journey(user_id=user_id, traveled_year=2019, sort_key="b", distance_km=20)
    fake_journey_repository.journeys = [older, newer, make_journey(user_id=user_id, traveled_year=2018)]

    result = await journey_service.list_journeys(
        command=ListJourneysCommand(
            user_id=user_id,
            page=PageQuery(cursor=None, limit=2),
            filters=JourneyFilters(year_from=None, year_to=None, transport_types=None),
        )
    )

    assert result.items == (
        JourneyFeedItem(
            journey_id=newer.journey_id,
            origin=newer.origin,
            destination=newer.destination,
            transport_type=newer.transport_type,
            traveled_year=2021,
            distance_km=10,
        ),
        JourneyFeedItem(
            journey_id=older.journey_id,
            origin=older.origin,
            destination=older.destination,
            transport_type=older.transport_type,
            traveled_year=2019,
            distance_km=20,
        ),
    )
    assert result.next_cursor is not None


async def test_get_journey_years_returns_repository_years(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journey_years: годы неудалённых поездок пользователя, по возрастанию."""
    user_id = uuid4()
    fake_journey_repository.journeys = [
        make_journey(user_id=user_id, traveled_year=2021),
        make_journey(user_id=user_id, traveled_year=2019),
        make_journey(user_id=user_id, traveled_year=2015, deleted_at=_DELETED_AT),
    ]

    result = await journey_service.get_journey_years(user_id=user_id)

    assert result == JourneyYearsResult(years=(2019, 2021))


def test_estimate_journey_distance_matches_great_circle() -> None:
    """estimate_journey_distance: расстояние Москва → Лондон тем же способом, что сохранит поездка (~2500 км)."""
    result = JourneyService.estimate_journey_distance(
        command=EstimateJourneyDistanceCommand(
            origin_latitude=55.75,
            origin_longitude=37.62,
            destination_latitude=51.5,
            destination_longitude=-0.12,
        )
    )

    assert result.distance_km == pytest.approx(2500, abs=60)
