"""Unit-тесты сущности ``JourneyEntity`` — инвариант origin≠destination, расчёт расстояния, чеканка id."""

from uuid import uuid4

import pytest

from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import TransportType
from app.journeys.exceptions import SameOriginAndDestinationError
from tests.builders import LONDON_PLACE_ID, MOSCOW_PLACE_ID, make_approximate_date, make_geo_point


def test_create_computes_great_circle_distance() -> None:
    """create: расстояние выводится из координат (Moscow→London ≈ 2500 км)."""
    journey_entity = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62),
        destination=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
        transport_type=TransportType.AIR,
        traveled_on=make_approximate_date(),
    )

    assert journey_entity.distance_km == pytest.approx(2500, abs=60)


def test_create_distance_for_one_degree_of_latitude() -> None:
    """create: 1° широты по тому же меридиану ≈ 111 км (опорная проверка haversine)."""
    journey_entity = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=uuid4(), latitude=0.0, longitude=0.0),
        destination=make_geo_point(place_id=uuid4(), latitude=1.0, longitude=0.0),
        transport_type=TransportType.LAND,
        traveled_on=make_approximate_date(),
    )

    assert journey_entity.distance_km == pytest.approx(111.2, abs=0.5)


def test_create_assigns_fields_and_mints_id() -> None:
    """create: чеканит собственный journey_id (uuid4) и прокидывает переданные поля."""
    user_id = uuid4()
    origin = make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62)
    destination = make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12)

    journey_entity = JourneyEntity.create(
        user_id=user_id,
        origin=origin,
        destination=destination,
        transport_type=TransportType.WATER,
        traveled_on=make_approximate_date(year=2019, month=3),
    )

    assert journey_entity.journey_id is not None
    assert journey_entity.user_id == user_id
    assert journey_entity.origin is origin
    assert journey_entity.destination is destination
    assert journey_entity.transport_type is TransportType.WATER


def test_create_mints_distinct_ids_per_call() -> None:
    """create: каждый вызов чеканит новый идентификатор (id не переиспользуется)."""
    first = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62),
        destination=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
        transport_type=TransportType.AIR,
        traveled_on=make_approximate_date(),
    )
    second = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62),
        destination=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
        transport_type=TransportType.AIR,
        traveled_on=make_approximate_date(),
    )

    assert first.journey_id != second.journey_id


def test_create_same_place_id_with_different_coordinates_raises() -> None:
    """create: один place_id при разных координатах origin/destination → SameOriginAndDestinationError."""
    with pytest.raises(SameOriginAndDestinationError):
        JourneyEntity.create(
            user_id=uuid4(),
            origin=make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62),
            destination=make_geo_point(place_id=MOSCOW_PLACE_ID, country_code="RU", latitude=56.0, longitude=38.0),
            transport_type=TransportType.LAND,
            traveled_on=make_approximate_date(),
        )


def test_create_distinct_place_ids_with_same_coordinates_is_allowed() -> None:
    """create: разные place_id при одинаковых координатах допустимы."""
    journey_entity = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=uuid4(), country_code="US", latitude=39.8, longitude=-89.6),
        destination=make_geo_point(place_id=uuid4(), country_code="US", latitude=39.8, longitude=-89.6),
        transport_type=TransportType.LAND,
        traveled_on=make_approximate_date(),
    )

    assert journey_entity.origin.place_id != journey_entity.destination.place_id
    assert journey_entity.distance_km == 0
