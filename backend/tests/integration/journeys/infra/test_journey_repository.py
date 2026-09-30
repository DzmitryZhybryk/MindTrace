"""
Интеграционные тесты ``JourneyRepository`` против реального Postgres.

Покрывают то, что нельзя проверить на фейках: round-trip сущность→модель (денормализованный
снапшот origin/destination, дата+точность, distance_km через REAL) и вставку нескольких
поездок одного пользователя (на ``user_id`` нет unique-констрейнта).
"""

import datetime as dt
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.journeys.domain.enums import TransportType
from app.journeys.infra.models import Journey
from app.journeys.infra.repositories import JourneyRepository
from tests.builders import LONDON_PLACE_ID, MOSCOW_PLACE_ID, make_approximate_date, make_journey


async def test_insert_journey_persists_snapshot(db_session: AsyncSession) -> None:
    """insert_journey: сущность ложится в плоский снапшот — имена/страны/координаты, дата+точность, distance_km."""
    user_id = uuid4()
    journey_entity = make_journey(
        user_id=user_id,
        transport_type=TransportType.AIR,
        traveled_on=make_approximate_date(year=2020, month=6),
    )

    await JourneyRepository(session=db_session).insert_journey(journey_entity=journey_entity)
    await db_session.commit()

    journey_model = (await db_session.execute(sa.select(Journey))).scalar_one()
    assert journey_model.id == journey_entity.journey_id
    assert journey_model.user_id == user_id
    assert journey_model.origin_place_id == MOSCOW_PLACE_ID
    assert journey_model.origin_country_code == "RU"
    assert journey_model.destination_place_id == LONDON_PLACE_ID
    assert journey_model.destination_country_code == "GB"
    assert journey_model.transport_type == "air"
    assert journey_model.traveled_on == dt.date(2020, 6, 1)
    assert journey_model.traveled_on_precision == "month"
    assert journey_model.distance_km == pytest.approx(2500, abs=60)
    assert journey_model.origin_latitude == pytest.approx(55.75, abs=0.01)


async def test_insert_multiple_journeys_for_same_user(db_session: AsyncSession) -> None:
    """insert_journey: несколько поездок одного пользователя сохраняются (на user_id нет unique)."""
    user_id = uuid4()
    repository = JourneyRepository(session=db_session)

    await repository.insert_journey(journey_entity=make_journey(user_id=user_id))
    await repository.insert_journey(journey_entity=make_journey(user_id=user_id))
    await db_session.commit()

    count = (await db_session.execute(sa.select(sa.func.count()).select_from(Journey))).scalar_one()
    assert count == 2
