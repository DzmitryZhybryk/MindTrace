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

from app.journeys.domain.enums import DatePrecision, TransportType
from app.journeys.infra.models import Journey
from app.journeys.infra.repositories import JourneyRepository
from tests.builders import make_approximate_date, make_geo_point, make_journey


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
    assert journey_model.origin_name == "Moscow"
    assert journey_model.origin_country_code == "RU"
    assert journey_model.destination_name == "London"
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


async def test_find_journeys_by_user_id_returns_only_owner_journeys(db_session: AsyncSession) -> None:
    """find_journeys_by_user_id: возвращает поездки только запрошенного пользователя, чужие отфильтрованы."""
    owner_id = uuid4()
    other_id = uuid4()
    repository = JourneyRepository(session=db_session)
    await repository.insert_journey(journey_entity=make_journey(user_id=owner_id))
    await repository.insert_journey(journey_entity=make_journey(user_id=other_id))
    await db_session.commit()

    result = await repository.find_journeys_by_user_id(user_id=owner_id)

    assert len(result) == 1
    assert result[0].user_id == owner_id


async def test_find_journeys_by_user_id_excludes_soft_deleted(db_session: AsyncSession) -> None:
    """find_journeys_by_user_id: soft-deleted поездки (deleted_at IS NOT NULL) в выборку не попадают."""
    user_id = uuid4()
    repository = JourneyRepository(session=db_session)
    await repository.insert_journey(journey_entity=make_journey(user_id=user_id))
    await repository.insert_journey(
        journey_entity=make_journey(user_id=user_id, deleted_at=dt.datetime(2021, 1, 1, tzinfo=dt.UTC)),
    )
    await db_session.commit()

    result = await repository.find_journeys_by_user_id(user_id=user_id)

    assert len(result) == 1
    assert result[0].deleted_at is None


async def test_find_journeys_by_user_id_orders_by_traveled_on(db_session: AsyncSession) -> None:
    """find_journeys_by_user_id: поездки отсортированы по дате поездки по возрастанию."""
    user_id = uuid4()
    repository = JourneyRepository(session=db_session)
    for year in (2022, 2018, 2020):
        await repository.insert_journey(
            journey_entity=make_journey(user_id=user_id, traveled_on=make_approximate_date(year=year)),
        )

    await db_session.commit()

    result = await repository.find_journeys_by_user_id(user_id=user_id)

    assert [journey_entity.traveled_on.value.year for journey_entity in result] == [2018, 2020, 2022]


async def test_find_journeys_by_user_id_hydrates_entity_round_trip(db_session: AsyncSession) -> None:
    """find_journeys_by_user_id: модель гидрируется обратно в сущность — снапшот точек, транспорт, дата+точность."""
    user_id = uuid4()
    journey_entity = make_journey(
        user_id=user_id,
        origin=make_geo_point(name="Moscow", country_code="RU", latitude=55.75, longitude=37.62),
        destination=make_geo_point(name="London", country_code="GB", latitude=51.5, longitude=-0.12),
        transport_type=TransportType.AIR,
        traveled_on=make_approximate_date(year=2020, month=6),
    )
    repository = JourneyRepository(session=db_session)
    await repository.insert_journey(journey_entity=journey_entity)
    await db_session.commit()

    [restored] = await repository.find_journeys_by_user_id(user_id=user_id)

    assert restored.journey_id == journey_entity.journey_id
    assert restored.origin.name == "Moscow"
    assert restored.origin.country_code == "RU"
    assert restored.origin.latitude == pytest.approx(55.75, abs=0.01)
    assert restored.destination.name == "London"
    assert restored.destination.country_code == "GB"
    assert restored.transport_type is TransportType.AIR
    assert restored.traveled_on.value == dt.date(2020, 6, 1)
    assert restored.traveled_on.precision is DatePrecision.MONTH


async def test_find_journeys_by_user_id_no_journeys_returns_empty(db_session: AsyncSession) -> None:
    """find_journeys_by_user_id: у пользователя без поездок — пустой список."""
    result = await JourneyRepository(session=db_session).find_journeys_by_user_id(user_id=uuid4())

    assert result == []
