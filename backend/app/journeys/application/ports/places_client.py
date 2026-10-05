from collections.abc import Collection
from typing import Protocol
from uuid import UUID

__all__ = ["PlacesClientPort"]


class PlacesClientPort(Protocol):
    """Исходящий вызов в geo, справочник мест."""

    async def get_missing_place_ids(self, *, place_ids: Collection[UUID]) -> frozenset[UUID]:
        """
        Возвращает те id из переданных, которых нет в справочнике geo.

        Нужен при создании и правке поездки: места отправления и назначения проверяются одним
        вызовом, чтобы поездка не ссылалась на несуществующее место.

        Args:
            place_ids: Id мест для проверки

        Returns:
            Id ненайденных мест; пусто, если все на месте
        """
        ...
