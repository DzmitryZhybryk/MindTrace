from collections.abc import Collection
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

__all__ = ["PlaceLocation", "PlacesClientPort"]


@dataclass(frozen=True, slots=True)
class PlaceLocation:
    """
    Что journeys получает от geo о месте: страну и координаты.

    Свой тип даже при совпадении полей с результатом geo: фиксирует набор полей, который нужен
    journeys, и не пускает изменения схемы geo в код journeys.
    """

    place_id: UUID
    country_code: str | None
    latitude: float
    longitude: float


class PlacesClientPort(Protocol):
    """Исходящий вызов в geo, справочник мест."""

    async def find_place_locations(self, *, place_ids: Collection[UUID]) -> tuple[PlaceLocation, ...]:
        """
        Находит страну и координаты мест по id.

        Нужен при создании и правке поездки и при расчёте расстояния: поездка хранит страну и
        координаты из справочника, а не те, что прислал клиент.

        Args:
            place_ids: Id мест

        Returns:
            Найденные места в произвольном порядке; несуществующих id в ответе нет
        """
        ...
