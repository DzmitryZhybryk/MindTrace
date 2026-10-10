from collections.abc import Collection
from uuid import UUID

from app.geo.application.schemas.commands import GetPlacesByIdsCommand
from app.geo.application.services.place import PlaceService
from app.journeys.application.ports.places_client import PlaceLocationResponse, PlacesClientPort


class InternalPlacesClient(PlacesClientPort):
    """Адаптер ``PlacesClientPort``: вызывает ``PlaceService`` из geo внутри процесса."""

    def __init__(self, place_service: PlaceService) -> None:
        self._place_service = place_service

    async def find_place_locations(self, *, place_ids: Collection[UUID]) -> tuple[PlaceLocationResponse, ...]:
        result = await self._place_service.get_places_by_ids(
            command=GetPlacesByIdsCommand(place_ids=frozenset(place_ids)),
        )
        return tuple(
            PlaceLocationResponse(
                place_id=item.place_id,
                country_code=item.country_code,
                latitude=item.latitude,
                longitude=item.longitude,
            )
            for item in result.items
        )
