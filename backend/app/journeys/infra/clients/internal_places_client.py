from collections.abc import Collection
from uuid import UUID

from app.geo.application.schemas.commands import GetMissingPlaceIdsCommand
from app.geo.application.services import PlaceService
from app.journeys.application.ports.places_client import PlacesClientPort


class InternalPlacesClient(PlacesClientPort):
    """Адаптер ``PlacesClientPort``: вызывает ``PlaceService`` из geo внутри процесса."""

    def __init__(self, place_service: PlaceService) -> None:
        self._place_service = place_service

    async def get_missing_place_ids(self, *, place_ids: Collection[UUID]) -> frozenset[UUID]:
        result = await self._place_service.get_missing_place_ids(
            command=GetMissingPlaceIdsCommand(place_ids=frozenset(place_ids)),
        )
        return result.place_ids
