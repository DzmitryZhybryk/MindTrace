"""
Интеграционный тест сборки ``GeoUnitOfWork`` против реального Postgres.

Транзакционная модель проверена в ``tests/integration/shared/infra/postgres/test_uow.py``;
здесь — только то, что репозиторий UoW работает на его сессии.
"""

from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.geo.infra.models import GeoPlace
from app.geo.infra.uow import GeoUnitOfWork


async def test_place_repository_read_works_inside_uow_transaction(
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Чтение через ``uow.place_repository`` внутри ``transaction()`` видит место, зафиксированное другой сессией."""
    place_id = uuid4()
    async with session_factory() as writer:
        writer.add(
            GeoPlace(
                id=place_id,
                external_id="GeoNames:524901",
                kind="city",
                name_en="Moscow",
                name_ru="Москва",
                country_code="RU",
                latitude=55.75,
                longitude=37.62,
                population=10_000_000,
            )
        )
        await writer.commit()

    async with session_factory() as session:
        uow = GeoUnitOfWork(session=session)
        async with uow.transaction():
            places = await uow.place_repository.find_places_by_ids(place_ids=(place_id,))

    assert [place_entity.place_id for place_entity in places] == [place_id]
