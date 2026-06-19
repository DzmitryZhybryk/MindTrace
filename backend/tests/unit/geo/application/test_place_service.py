"""Unit-тесты ``PlaceService.search_places`` на фейк-репозитории: пустой запрос, маппинг, фоллбэк, сигнал."""

from structlog.testing import capture_logs

from app.geo.application.schemas import SearchPlacesCommand
from app.geo.application.services import PlaceService
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
