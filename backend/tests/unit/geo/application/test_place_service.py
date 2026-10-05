"""Unit-тесты ``PlaceService`` на фейк-репозитории: поиск, названия мест по id, проверка существования мест."""

from uuid import uuid4

from structlog.testing import capture_logs

from app.geo.application.schemas.commands import GetMissingPlaceIdsCommand, ResolvePlacesCommand, SearchPlacesCommand
from app.geo.application.services.place import PlaceService
from app.geo.domain.enums import Language
from tests.builders import make_place
from tests.fakes import FakePlaceRepository


async def test_search_places_blank_query_short_circuits(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """search_places: пробельный запрос → пустая выдача, репозиторий не опрашивается (сид не всплывает)."""
    fake_place_repository.places.append(make_place())

    result = await place_service.search_places(
        SearchPlacesCommand(search_text="   ", language=Language.EN, limit=10),
    )

    assert result.items == ()


async def test_search_places_maps_candidate_fields(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """search_places: поля кандидата (place_id/имя/страна/координаты/население) маппятся в PlaceSearchItem.

    Сортировку по населению и обрезку по limit делает SQL-репозиторий, не сервис — они покрыты
    integration-тестом ``PlaceRepository`` против реального Postgres, поэтому в unit не дублируются.
    """
    moscow = make_place(en="Moscow", ru="Москва", country_code="RU", population=10_000_000)
    fake_place_repository.places.append(moscow)

    result = await place_service.search_places(
        SearchPlacesCommand(search_text="Mos", language=Language.EN, limit=10),
    )

    [item] = result.items
    assert item.name == "Moscow"
    assert item.place_id == moscow.place_id
    assert item.country_code == "RU"
    assert item.latitude == moscow.latitude
    assert item.longitude == moscow.longitude
    assert item.population == moscow.population


async def test_search_places_resolves_names_under_language_and_flags_missing(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """search_places: имена резолвятся под язык; нет перевода → фоллбэк en + лог geo.place_name_missing."""
    moscow = make_place(en="Moscow", ru="Москва", population=10_000_000)
    mostar = make_place(en="Mostar", ru=None, country_code="BA", population=100_000)
    fake_place_repository.places.extend([moscow, mostar])

    with capture_logs() as logs:
        result = await place_service.search_places(
            SearchPlacesCommand(search_text="Mos", language=Language.RU, limit=10),
        )

    assert [item.name for item in result.items] == ["Москва", "Mostar"]
    missing = [log for log in logs if log["event"] == "geo.place_name_missing"]
    assert len(missing) == 1
    assert missing[0]["language"] is Language.RU
    assert missing[0]["place_id"] == mostar.place_id


async def test_resolve_places_returns_names_in_requested_language_with_en_fallback(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """resolve_places: названия на языке запроса, у места без перевода — английское."""
    moscow = make_place(en="Moscow", ru="Москва")
    mostar = make_place(en="Mostar", ru=None, country_code="BA")
    fake_place_repository.places.extend([moscow, mostar])

    result = await place_service.resolve_places(
        ResolvePlacesCommand(place_ids=(moscow.place_id, mostar.place_id), language=Language.RU),
    )

    assert {item.place_id: item.name for item in result.items} == {moscow.place_id: "Москва", mostar.place_id: "Mostar"}


async def test_resolve_places_omits_unknown_ids_and_warns(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """resolve_places: неизвестный id в ответ не попадает и пишется в лог предупреждением."""
    moscow = make_place()
    fake_place_repository.places.append(moscow)
    unknown_id = uuid4()

    with capture_logs() as logs:
        result = await place_service.resolve_places(
            ResolvePlacesCommand(place_ids=(moscow.place_id, unknown_id), language=Language.EN),
        )

    assert [item.place_id for item in result.items] == [moscow.place_id]
    [warning] = [log for log in logs if log["event"] == "geo.place_ids_unknown"]
    assert warning["log_level"] == "warning"
    assert warning["count"] == 1
    assert warning["place_ids"] == [unknown_id]


async def test_resolve_places_many_unknown_logs_count_and_sample(place_service: PlaceService) -> None:
    """resolve_places: при множестве неизвестных id в лог идут их число и первые 10, а не весь список."""
    unknown_ids = [uuid4() for _ in range(25)]

    with capture_logs() as logs:
        await place_service.resolve_places(ResolvePlacesCommand(place_ids=tuple(unknown_ids), language=Language.EN))

    [warning] = [log for log in logs if log["event"] == "geo.place_ids_unknown"]
    assert warning["count"] == 25
    assert warning["place_ids"] == sorted(unknown_ids)[:10]


async def test_resolve_places_all_known_does_not_warn(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """resolve_places: когда все места найдены, предупреждения нет."""
    moscow = make_place()
    fake_place_repository.places.append(moscow)

    with capture_logs() as logs:
        await place_service.resolve_places(ResolvePlacesCommand(place_ids=(moscow.place_id,), language=Language.EN))

    assert [log for log in logs if log["event"] == "geo.place_ids_unknown"] == []


async def test_get_missing_place_ids_returns_only_unknown_ids(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """get_missing_place_ids: возвращает ровно те id, которых нет в газеттире."""
    moscow = make_place()
    fake_place_repository.places.append(moscow)
    unknown_id = uuid4()

    result = await place_service.get_missing_place_ids(
        command=GetMissingPlaceIdsCommand(place_ids=frozenset({moscow.place_id, unknown_id})),
    )

    assert result.place_ids == frozenset({unknown_id})


async def test_get_missing_place_ids_all_known_returns_empty(
    place_service: PlaceService,
    fake_place_repository: FakePlaceRepository,
) -> None:
    """get_missing_place_ids: все места на месте → пустое множество."""
    moscow = make_place()
    fake_place_repository.places.append(moscow)

    result = await place_service.get_missing_place_ids(
        command=GetMissingPlaceIdsCommand(place_ids=frozenset({moscow.place_id})),
    )

    assert result.place_ids == frozenset()
