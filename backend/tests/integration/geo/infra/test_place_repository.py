"""
Интеграционные тесты ``PlaceRepository`` против реального Postgres.

Покрывают то, что нельзя проверить на фейках: реальный префиксный матч ``lower(name) LIKE
'q%'`` по btree ``text_pattern_ops`` (en и ru, не подстрока), сортировку по убыванию
населения (места без населения — в конце), лимит, экранирование LIKE-метасимволов
пользовательского ввода и выборку мест по id.
"""

from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.geo.domain.enums import Language
from app.geo.infra.models import GeoPlace
from app.geo.infra.repositories import PlaceRepository


async def test_search_matches_en_prefix_ordered_by_population(db_session: AsyncSession) -> None:
    """search: префикс по name_en матчит несколько городов, выдача — по убыванию населения."""
    db_session.add_all(
        [
            GeoPlace(
                id=uuid4(),
                external_id="GeoNames:1",
                kind="city",
                name_en="Moscow",
                name_ru="Москва",
                country_code="RU",
                latitude=55.75,
                longitude=37.62,
                population=10_000_000,
            ),
            GeoPlace(
                id=uuid4(),
                external_id="GeoNames:2",
                kind="city",
                name_en="Mostar",
                name_ru=None,
                country_code="BA",
                latitude=43.3,
                longitude=17.8,
                population=100_000,
            ),
            GeoPlace(
                id=uuid4(),
                external_id="GeoNames:3",
                kind="city",
                name_en="Berlin",
                name_ru="Берлин",
                country_code="DE",
                latitude=52.5,
                longitude=13.4,
                population=3_500_000,
            ),
        ],
    )
    await db_session.commit()

    places = await PlaceRepository(session=db_session).search_places_by_name(search_text="Mos", limit=10)

    assert [place_entity.display_name(language=Language.EN) for place_entity in places] == ["Moscow", "Mostar"]


async def test_search_matches_ru_prefix(db_session: AsyncSession) -> None:
    """search: префикс кириллицей матчит по name_ru (lower() на UTF-8)."""
    moscow_id = uuid4()
    db_session.add_all(
        [
            GeoPlace(
                id=moscow_id,
                external_id="GeoNames:1",
                kind="city",
                name_en="Moscow",
                name_ru="Москва",
                country_code="RU",
                latitude=55.75,
                longitude=37.62,
                population=10_000_000,
            ),
            GeoPlace(
                id=uuid4(),
                external_id="GeoNames:2",
                kind="city",
                name_en="Saint Petersburg",
                name_ru="Санкт-Петербург",
                country_code="RU",
                latitude=59.9,
                longitude=30.3,
                population=5_000_000,
            ),
        ],
    )
    await db_session.commit()

    places = await PlaceRepository(session=db_session).search_places_by_name(search_text="Мос", limit=10)

    assert [place_entity.place_id for place_entity in places] == [moscow_id]


async def test_search_prefix_does_not_match_substring(db_session: AsyncSession) -> None:
    """search: матч идёт по началу имени — 'York' не находит 'New York'."""
    db_session.add(
        GeoPlace(
            id=uuid4(),
            external_id="GeoNames:1",
            kind="city",
            name_en="New York",
            name_ru=None,
            country_code="US",
            latitude=40.7,
            longitude=-74.0,
            population=8_000_000,
        ),
    )
    await db_session.commit()

    places = await PlaceRepository(session=db_session).search_places_by_name(search_text="York", limit=10)

    assert places == []


async def test_search_escapes_like_metacharacters(db_session: AsyncSession) -> None:
    """search: '%' в запросе экранируется и трактуется литералом, а не как LIKE-wildcard."""
    literal_id = uuid4()
    db_session.add_all(
        [
            GeoPlace(
                id=literal_id,
                external_id="GeoNames:1",
                kind="city",
                name_en="A%B",
                name_ru=None,
                country_code="RU",
                latitude=0.0,
                longitude=0.0,
                population=100,
            ),
            GeoPlace(
                id=uuid4(),
                external_id="GeoNames:2",
                kind="city",
                name_en="AXB",
                name_ru=None,
                country_code="RU",
                latitude=0.0,
                longitude=0.0,
                population=200,
            ),
        ],
    )
    await db_session.commit()

    places = await PlaceRepository(session=db_session).search_places_by_name(search_text="A%", limit=10)

    assert [place_entity.place_id for place_entity in places] == [literal_id]


async def test_search_respects_limit(db_session: AsyncSession) -> None:
    """search: лимит обрезает выдачу, оставляя самые населённые совпадения."""
    db_session.add_all(
        GeoPlace(
            id=uuid4(),
            external_id=f"GeoNames:{index}",
            kind="city",
            name_en=f"Mos{index}",
            name_ru=None,
            country_code="RU",
            latitude=0.0,
            longitude=0.0,
            population=population,
        )
        for index, population in enumerate([300, 200, 100])
    )
    await db_session.commit()

    places = await PlaceRepository(session=db_session).search_places_by_name(search_text="Mos", limit=2)

    assert [place_entity.population for place_entity in places] == [300, 200]


async def test_search_puts_places_without_population_last(db_session: AsyncSession) -> None:
    """search: место без населения идёт после мест с населением, а не первым (NULLS LAST)."""
    sea_id, town_id = uuid4(), uuid4()
    db_session.add_all(
        [
            GeoPlace(
                id=sea_id,
                external_id="Test:sea",
                kind="sea",
                name_en="Mosea",
                name_ru=None,
                country_code=None,
                latitude=0.0,
                longitude=0.0,
                population=None,
            ),
            GeoPlace(
                id=town_id,
                external_id="Test:town",
                kind="city",
                name_en="Mostown",
                name_ru=None,
                country_code="RU",
                latitude=0.0,
                longitude=0.0,
                population=100,
            ),
        ]
    )
    await db_session.commit()

    places = await PlaceRepository(session=db_session).search_places_by_name(search_text="Mo", limit=10)

    assert [place_entity.place_id for place_entity in places] == [town_id, sea_id]
    assert places[1].country_code is None


async def test_find_places_by_ids_returns_only_existing(db_session: AsyncSession) -> None:
    """find_places_by_ids: находит места по id, неизвестные id молча пропускает, имена гидрируются."""
    moscow_id, berlin_id = uuid4(), uuid4()
    db_session.add_all(
        [
            GeoPlace(
                id=moscow_id,
                external_id="GeoNames:1",
                kind="city",
                name_en="Moscow",
                name_ru="Москва",
                country_code="RU",
                latitude=55.75,
                longitude=37.62,
                population=10_000_000,
            ),
            GeoPlace(
                id=berlin_id,
                external_id="GeoNames:2",
                kind="city",
                name_en="Berlin",
                name_ru="Берлин",
                country_code="DE",
                latitude=52.52,
                longitude=13.4,
                population=3_000_000,
            ),
        ]
    )
    await db_session.commit()

    places = await PlaceRepository(session=db_session).find_places_by_ids(place_ids=(moscow_id, uuid4()))

    [moscow] = places
    assert moscow.place_id == moscow_id
    assert moscow.display_name(language=Language.RU) == "Москва"
