"""Unit-тесты ``JourneyService.create_journey`` на фейк-UoW: снапшот, фиксация, проброс доменных ошибок."""

import datetime as dt
from uuid import uuid4

import pytest

from app.journeys.application.schemas import CreateJourneyCommand, PlaceSnapshot
from app.journeys.application.services import JourneyService
from app.journeys.domain.enums import DatePrecision, TransportType
from app.journeys.exceptions import (
    InvalidJourneyDateError,
    JourneyDateInFutureError,
    SameOriginAndDestinationError,
)
from tests.fakes import FakeJourneyRepository, FakeJourneyUnitOfWork

_MOSCOW = PlaceSnapshot(name="Moscow", country_code="RU", latitude=55.75, longitude=37.62)
_LONDON = PlaceSnapshot(name="London", country_code="GB", latitude=51.5, longitude=-0.12)


async def test_create_journey_snapshots_places_and_commits(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
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
    assert journey.origin.name == "Moscow"
    assert journey.origin.country_code == "RU"
    assert journey.destination.name == "London"
    assert journey.destination.latitude == pytest.approx(51.5)
    assert journey.transport_type is TransportType.AIR
    assert journey.traveled_on.value == dt.date(2020, 6, 1)
    assert journey.traveled_on.precision is DatePrecision.MONTH
    assert journey.distance_km == pytest.approx(2500, abs=60)
    fake_journey_uow.commit_mock.assert_awaited_once()


async def test_create_journey_same_place_raises_without_persisting(
    journey_service: JourneyService,
    fake_journey_uow: FakeJourneyUnitOfWork,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """create_journey: одинаковые координаты origin/destination → доменная ошибка, без вставки и коммита."""
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
