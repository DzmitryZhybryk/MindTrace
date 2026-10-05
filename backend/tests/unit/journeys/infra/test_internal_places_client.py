"""
Юнит-тест адаптера ``InternalPlacesClient`` (journeys → geo).

Реальный ``PlaceService`` на фейковом репозитории geo; фейкаем только I/O-границу geo. Api-тесты
journeys подменяют клиента целиком, поэтому стык «journeys спрашивает — geo отвечает» проверяется
только здесь.
"""

from uuid import uuid4

from app.geo.application.services.place import PlaceService
from app.journeys.infra.clients.internal_places_client import InternalPlacesClient
from tests.builders import make_place
from tests.fakes import FakePlaceRepository


async def test_get_missing_place_ids_returns_ids_unknown_to_geo() -> None:
    """get_missing_place_ids: возвращает id, которых нет в справочнике geo, известные — нет."""
    moscow = make_place()
    place_repository = FakePlaceRepository()
    place_repository.places.append(moscow)
    client = InternalPlacesClient(place_service=PlaceService(repository=place_repository))
    unknown_id = uuid4()

    missing_place_ids = await client.get_missing_place_ids(place_ids=(moscow.place_id, unknown_id))

    assert missing_place_ids == frozenset({unknown_id})
