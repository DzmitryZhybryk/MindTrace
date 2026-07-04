"""
Unit-тесты ``JourneyService`` на фейк-UoW.

``create_journey`` — снапшот мест, фиксация, проброс доменных ошибок.
``get_journeys_map`` — свёртка поездок в карту: origin+destination, схлопывание городов,
годы визитов (уникальные, по возрастанию), сортировка стран и городов.
"""

import datetime as dt
from uuid import uuid4

import pytest

from app.journeys.application.schemas import CreateJourneyCommand, JourneysMapResult, PlaceSnapshot
from app.journeys.application.services import JourneyService
from app.journeys.domain.enums import DatePrecision, TransportType
from app.journeys.exceptions import (
    InvalidJourneyDateError,
    JourneyDateInFutureError,
    SameOriginAndDestinationError,
)
from tests.builders import make_approximate_date, make_geo_point, make_journey
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


async def test_get_journeys_map_no_journeys_returns_empty(journey_service: JourneyService) -> None:
    """get_journeys_map: у пользователя нет поездок → пустой агрегат без стран."""
    result = await journey_service.get_journeys_map(user_id=uuid4())

    assert result == JourneysMapResult(countries=())


async def test_get_journeys_map_counts_both_origin_and_destination(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journeys_map: поездка A→B делает посещёнными оба города, год визита = год поездки."""
    user_id = uuid4()
    fake_journey_repository.journeys.append(
        make_journey(
            user_id=user_id,
            origin=make_geo_point(name="Moscow", country_code="RU", latitude=55.75, longitude=37.62),
            destination=make_geo_point(name="London", country_code="GB", latitude=51.5, longitude=-0.12),
            traveled_on=make_approximate_date(year=2020),
        )
    )

    result = await journey_service.get_journeys_map(user_id=user_id)

    assert [country.country_code for country in result.countries] == ["GB", "RU"]
    gb, ru = result.countries
    assert [city.name for city in gb.cities] == ["London"]
    assert gb.cities[0].years == (2020,)
    assert gb.cities[0].latitude == pytest.approx(51.5)
    assert gb.cities[0].longitude == pytest.approx(-0.12)
    assert [city.name for city in ru.cities] == ["Moscow"]
    assert ru.cities[0].years == (2020,)


async def test_get_journeys_map_merges_city_visits_with_sorted_unique_years(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journeys_map: город из origin/destination разных поездок → одна точка, годы уникальны и сортированы."""
    user_id = uuid4()
    london = make_geo_point(name="London", country_code="GB", latitude=51.5, longitude=-0.12)
    fake_journey_repository.journeys.extend(
        [
            make_journey(
                user_id=user_id,
                origin=make_geo_point(name="Moscow", country_code="RU", latitude=55.75, longitude=37.62),
                destination=london,
                traveled_on=make_approximate_date(year=2022),
            ),
            make_journey(
                user_id=user_id,
                origin=london,
                destination=make_geo_point(name="Paris", country_code="FR", latitude=48.85, longitude=2.35),
                traveled_on=make_approximate_date(year=2019),
            ),
            make_journey(
                user_id=user_id,
                origin=make_geo_point(name="Berlin", country_code="DE", latitude=52.52, longitude=13.4),
                destination=london,
                traveled_on=make_approximate_date(year=2019),
            ),
        ]
    )

    result = await journey_service.get_journeys_map(user_id=user_id)

    gb = next(country for country in result.countries if country.country_code == "GB")
    assert [city.name for city in gb.cities] == ["London"]
    assert gb.cities[0].years == (2019, 2022)


async def test_get_journeys_map_folds_city_name_case_insensitively(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journeys_map: один город в разном регистре (London/london) схлопывается в одну точку."""
    user_id = uuid4()
    fake_journey_repository.journeys.extend(
        [
            make_journey(
                user_id=user_id,
                origin=make_geo_point(name="Moscow", country_code="RU", latitude=55.75, longitude=37.62),
                destination=make_geo_point(name="London", country_code="GB", latitude=51.5, longitude=-0.12),
                traveled_on=make_approximate_date(year=2020),
            ),
            make_journey(
                user_id=user_id,
                origin=make_geo_point(name="Paris", country_code="FR", latitude=48.85, longitude=2.35),
                destination=make_geo_point(name="london", country_code="GB", latitude=51.5, longitude=-0.12),
                traveled_on=make_approximate_date(year=2021),
            ),
        ]
    )

    result = await journey_service.get_journeys_map(user_id=user_id)

    gb = next(country for country in result.countries if country.country_code == "GB")
    assert len(gb.cities) == 1
    assert gb.cities[0].years == (2020, 2021)


async def test_get_journeys_map_sorts_countries_by_code_and_cities_by_name(
    journey_service: JourneyService,
    fake_journey_repository: FakeJourneyRepository,
) -> None:
    """get_journeys_map: страны в ответе отсортированы по ISO-коду, города внутри страны — по имени."""
    user_id = uuid4()
    fake_journey_repository.journeys.extend(
        [
            make_journey(
                user_id=user_id,
                origin=make_geo_point(name="Moscow", country_code="RU", latitude=55.75, longitude=37.62),
                destination=make_geo_point(name="Kazan", country_code="RU", latitude=55.8, longitude=49.1),
                traveled_on=make_approximate_date(year=2020),
            ),
            make_journey(
                user_id=user_id,
                origin=make_geo_point(name="London", country_code="GB", latitude=51.5, longitude=-0.12),
                destination=make_geo_point(name="Abakan", country_code="RU", latitude=53.7, longitude=91.4),
                traveled_on=make_approximate_date(year=2021),
            ),
        ]
    )

    result = await journey_service.get_journeys_map(user_id=user_id)

    assert [country.country_code for country in result.countries] == ["GB", "RU"]
    ru = next(country for country in result.countries if country.country_code == "RU")
    assert [city.name for city in ru.cities] == ["Abakan", "Kazan", "Moscow"]
