"""
Unit-тесты ``JourneyService`` на фейк-UoW.

``create_journey`` — снапшот мест, фиксация, проброс доменных ошибок.
``get_journeys_map`` — раскладка мест из репозитория по странам.
"""

import datetime as dt
from uuid import UUID, uuid4

import pytest

from app.journeys.application.schemas import CreateJourneyCommand, JourneysMapResult
from app.journeys.application.services import JourneyService
from app.journeys.domain.enums import DatePrecision, TransportType
from app.journeys.exceptions import (
    InvalidJourneyDateError,
    JourneyDateInFutureError,
    SameOriginAndDestinationError,
    UnknownPlaceError,
)
from tests.builders import LONDON_PLACE_ID, MOSCOW_PLACE_ID, make_geo_point
from tests.fakes import FakeJourneyRepository, FakeJourneyUnitOfWork, FakePlacesClient

_MOSCOW = make_geo_point(place_id=MOSCOW_PLACE_ID, country_code="RU", latitude=55.75, longitude=37.62)
_LONDON = make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12)


async def test_create_journey_snapshots_places_and_commits(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
    fake_places_client: FakePlacesClient,
) -> None:
    """create_journey: снапшотит места из команды, собирает дату, вставляет поездку и коммитит один раз."""
    user_id = uuid4()
    command = CreateJourneyCommand(
        user_id=user_id,
        origin=_MOSCOW,
        destination=_LONDON,
        transport_type=TransportType.AIR,
        traveled_year=2020,
        traveled_month=6,
        traveled_day=None,
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
    assert journey.traveled_on.value == dt.date(2020, 6, 1)
    assert journey.traveled_on.precision is DatePrecision.MONTH
    assert journey.distance_km == pytest.approx(2500, abs=60)
    fake_journey_uow.commit_mock.assert_awaited_once()
    assert fake_journey_uow.transactions_started == 1
    assert fake_places_client.calls == [(MOSCOW_PLACE_ID, LONDON_PLACE_ID)]


async def test_create_journey_same_place_raises_without_persisting(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """create_journey: одинаковые place_id origin/destination → доменная ошибка, без вставки и коммита."""
    command = CreateJourneyCommand(
        user_id=uuid4(),
        origin=_MOSCOW,
        destination=_MOSCOW,
        transport_type=TransportType.LAND,
        traveled_year=2020,
        traveled_month=None,
        traveled_day=None,
    )

    with pytest.raises(SameOriginAndDestinationError):
        await journey_service.create_journey(command=command)

    assert fake_journey_repository.journeys == []
    fake_journey_uow.commit_mock.assert_not_awaited()


async def test_create_journey_future_year_raises_without_persisting(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """create_journey: год в будущем → JourneyDateInFutureError, поездка не создаётся."""
    command = CreateJourneyCommand(
        user_id=uuid4(),
        origin=_MOSCOW,
        destination=_LONDON,
        transport_type=TransportType.AIR,
        traveled_year=dt.datetime.now(tz=dt.UTC).year + 1,
        traveled_month=None,
        traveled_day=None,
    )

    with pytest.raises(JourneyDateInFutureError):
        await journey_service.create_journey(command=command)

    assert fake_journey_repository.journeys == []
    fake_journey_uow.commit_mock.assert_not_awaited()


async def test_create_journey_day_without_month_raises(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """create_journey: день без месяца → InvalidJourneyDateError, поездка не создаётся."""
    command = CreateJourneyCommand(
        user_id=uuid4(),
        origin=_MOSCOW,
        destination=_LONDON,
        transport_type=TransportType.AIR,
        traveled_year=2020,
        traveled_month=None,
        traveled_day=15,
    )

    with pytest.raises(InvalidJourneyDateError):
        await journey_service.create_journey(command=command)

    assert fake_journey_repository.journeys == []


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
        traveled_month=None,
        traveled_day=None,
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
