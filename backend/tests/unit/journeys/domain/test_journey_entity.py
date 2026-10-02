"""Unit-тесты сущности ``JourneyEntity`` — расчёт расстояния и чеканка id."""

from uuid import uuid4

import pytest

from app.journeys.domain.entities import JourneyEntity
from app.journeys.domain.enums import TransportType
from tests.builders import LONDON_PLACE_ID, MOSCOW_PLACE_ID, make_geo_point


def test_create_computes_great_circle_distance() -> None:
    """create: расстояние выводится из координат (Moscow→London ≈ 2500 км)."""
    journey_entity = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62),
        destination=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
        transport_type=TransportType.AIR,
        traveled_year=2020,
    )

    assert journey_entity.distance_km == pytest.approx(2500, abs=60)


def test_create_distance_for_one_degree_of_latitude() -> None:
    """create: 1° широты по тому же меридиану ≈ 111 км (опорная проверка haversine)."""
    journey_entity = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=uuid4(), latitude=0.0, longitude=0.0),
        destination=make_geo_point(place_id=uuid4(), latitude=1.0, longitude=0.0),
        transport_type=TransportType.LAND,
        traveled_year=2020,
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
        traveled_year=2019,
    )

    assert journey_entity.journey_id is not None
    assert journey_entity.user_id == user_id
    assert journey_entity.origin is origin
    assert journey_entity.destination is destination
    assert journey_entity.transport_type is TransportType.WATER
    assert journey_entity.traveled_year == 2019


def test_create_mints_distinct_ids_per_call() -> None:
    """create: каждый вызов чеканит новый идентификатор (id не переиспользуется)."""
    first = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62),
        destination=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
        transport_type=TransportType.AIR,
        traveled_year=2020,
    )
    second = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=MOSCOW_PLACE_ID, latitude=55.75, longitude=37.62),
        destination=make_geo_point(place_id=LONDON_PLACE_ID, country_code="GB", latitude=51.5, longitude=-0.12),
        transport_type=TransportType.AIR,
        traveled_year=2020,
    )

    assert first.journey_id != second.journey_id


def test_create_distinct_places_with_same_coordinates_have_zero_distance() -> None:
    """create: разные места с одинаковыми координатами — расстояние 0."""
    journey_entity = JourneyEntity.create(
        user_id=uuid4(),
        origin=make_geo_point(place_id=uuid4(), country_code="US", latitude=39.8, longitude=-89.6),
        destination=make_geo_point(place_id=uuid4(), country_code="US", latitude=39.8, longitude=-89.6),
        transport_type=TransportType.LAND,
        traveled_year=2020,
    )

    assert journey_entity.distance_km == 0
