from dataclasses import dataclass
from uuid import UUID

from app.journeys.application.ports.journey_repository import JourneyFilters
from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint
from app.shared.fractional_index import MovePlacement
from app.shared.pagination import PageQuery

__all__ = [
    "CreateJourneyCommand",
    "EstimateJourneyDistanceCommand",
    "GetMovementsMapCommand",
    "ListJourneysCommand",
    "MoveJourneyCommand",
    "UpdateJourneyCommand",
]


@dataclass(frozen=True, slots=True)
class CreateJourneyCommand:
    """Данные для создания поездки."""

    origin: GeoPoint
    destination: GeoPoint
    transport_type: TransportType
    traveled_year: int


@dataclass(frozen=True, slots=True)
class UpdateJourneyCommand:
    """Новые значения всех полей поездки: правка заменяет поездку целиком."""

    origin: GeoPoint
    destination: GeoPoint
    transport_type: TransportType
    traveled_year: int


@dataclass(frozen=True, slots=True)
class MoveJourneyCommand:
    """Куда перенести поездку: после или перед поездкой-соседом."""

    neighbor_journey_id: UUID
    placement: MovePlacement


@dataclass(frozen=True, slots=True)
class EstimateJourneyDistanceCommand:
    """Координаты концов маршрута, расстояние между которыми нужно посчитать."""

    origin_latitude: float
    origin_longitude: float
    destination_latitude: float
    destination_longitude: float


@dataclass(frozen=True, slots=True)
class ListJourneysCommand:
    """Какую страницу ленты поездок отдать и с каким фильтром."""

    page: PageQuery
    filters: JourneyFilters


@dataclass(frozen=True, slots=True)
class GetMovementsMapCommand:
    """
    Фильтр карты перемещений.

    ``transport_types`` — виды транспорта, поездки на которых учитываются; ``None`` — все.
    Окна лет здесь нет: годы маршрутов уходят на фронт, и окно он применяет сам.
    """

    transport_types: frozenset[TransportType] | None
