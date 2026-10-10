"""
Юнит-тест адаптера ``InternalPlacesClient`` (journeys → geo).

Реальный ``PlaceService`` на фейковом репозитории geo; фейкаем только I/O-границу geo. Api-тесты
journeys подменяют клиента целиком, поэтому стык «journeys спрашивает — geo отвечает» проверяется
только здесь.
"""

from uuid import uuid4

from app.geo.application.services.place import PlaceService
from app.journeys.application.ports.places_client import PlaceLocation
from app.journeys.infra.clients.internal_places_client import InternalPlacesClient
from tests.builders import make_place
from tests.fakes import FakePlaceRepository


async def test_find_place_locations_maps_known_places_from_geo() -> None:
    """find_place_locations: страна и координаты мест из справочника geo, неизвестного id в ответе нет."""
    moscow = make_place()
    sea = make_place(en="Barents Sea", ru=None, country_code=None, latitude=75.0, longitude=40.0, population=None)
    place_repository = FakePlaceRepository()
    place_repository.places.extend([moscow, sea])
    client = InternalPlacesClient(place_service=PlaceService(repository=place_repository))

    locations = await client.find_place_locations(place_ids=(moscow.place_id, sea.place_id, uuid4()))

    assert sorted(locations, key=lambda location: location.latitude) == [
        PlaceLocation(place_id=moscow.place_id, country_code="RU", latitude=55.75, longitude=37.62),
        PlaceLocation(place_id=sea.place_id, country_code=None, latitude=75.0, longitude=40.0),
    ]
