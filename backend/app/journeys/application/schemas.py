from dataclasses import dataclass
from uuid import UUID

from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint
from app.shared.fractional_index import MovePlacement
from app.shared.pagination import CursorPage, PageQuery

__all__ = [
    "CreateJourneyCommand",
    "DeleteJourneyCommand",
    "EstimateJourneyDistanceCommand",
    "GetMovementsMapCommand",
    "JourneyDistanceResult",
    "JourneyFeedItem",
    "JourneyFilters",
    "JourneyOrderScope",
    "JourneyYearsResult",
    "JourneysGlobeResult",
    "JourneysMapResult",
    "ListJourneysCommand",
    "ListJourneysResult",
    "MapCityVisit",
    "MapCountryVisits",
    "MoveJourneyCommand",
    "MoveJourneyResult",
    "MovementConnection",
    "MovementsMapResult",
    "UpdateJourneyCommand",
    "VisitedPlace",
]


@dataclass(frozen=True, slots=True)
class CreateJourneyCommand:
    """Данные для создания поездки."""

    user_id: UUID
    origin: GeoPoint
    destination: GeoPoint
    transport_type: TransportType
    traveled_year: int


@dataclass(frozen=True, slots=True)
class UpdateJourneyCommand:
    """Новые значения всех полей поездки: правка заменяет поездку целиком."""

    user_id: UUID
    journey_id: UUID
    origin: GeoPoint
    destination: GeoPoint
    transport_type: TransportType
    traveled_year: int


@dataclass(frozen=True, slots=True)
class DeleteJourneyCommand:
    """Какую поездку пользователя удалить."""

    user_id: UUID
    journey_id: UUID


@dataclass(frozen=True, slots=True)
class MoveJourneyCommand:
    """Какую поездку пользователя перенести и куда: после или перед поездкой-соседом."""

    user_id: UUID
    journey_id: UUID
    neighbor_journey_id: UUID
    placement: MovePlacement


@dataclass(frozen=True, slots=True)
class MoveJourneyResult:
    """Год поездки после переноса: он берётся от соседа и может смениться."""

    traveled_year: int


@dataclass(frozen=True, slots=True)
class EstimateJourneyDistanceCommand:
    """Координаты концов маршрута, расстояние между которыми нужно посчитать."""

    origin_latitude: float
    origin_longitude: float
    destination_latitude: float
    destination_longitude: float


@dataclass(frozen=True, slots=True)
class JourneyDistanceResult:
    """Расстояние маршрута по большой окружности, км — то же, что поездка сохранит."""

    distance_km: int


@dataclass(frozen=True, slots=True)
class JourneyOrderScope:
    """Область ручного порядка поездок: поездки одного пользователя за один год."""

    user_id: UUID
    traveled_year: int


@dataclass(frozen=True, slots=True)
class MapCityVisit:
    """
    Посещённый город на карте путешествий.

    ``years`` — годы поездок, в которых город был отправлением или назначением, по возрастанию.
    Названия нет: фронт запрашивает его у geo по ``place_id``.
    """

    place_id: UUID
    latitude: float
    longitude: float
    years: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class MapCountryVisits:
    """
    Посещённая страна (ISO alpha-2) и города, посещённые в ней пользователем.

    Имя страны не несём: фронт резолвит его из кода через ``Intl.DisplayNames`` (см.
    country-code-contract). ``cities`` непустой — страна попадает в агрегат только если в ней
    есть хотя бы один посещённый город.
    """

    country_code: str
    cities: tuple[MapCityVisit, ...]


@dataclass(frozen=True, slots=True)
class JourneysMapResult:
    """Агрегат карты путешествий: посещённые страны с городами и годами визитов."""

    countries: tuple[MapCountryVisits, ...]


@dataclass(frozen=True, slots=True)
class JourneysGlobeResult:
    """Посещённые места для глобуса, каждое по одному разу."""

    places: tuple[GeoPoint, ...]


@dataclass(frozen=True, slots=True)
class VisitedPlace:
    """
    Место, где пользователь побывал, — строка выдачи репозитория.

    ``years`` — годы всех поездок с местом, по возрастанию.
    """

    place: GeoPoint
    years: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class GetMovementsMapCommand:
    """
    Фильтр карты перемещений.

    ``transport_types`` — виды транспорта, поездки на которых учитываются; ``None`` — все.
    Окна лет здесь нет: годы маршрутов уходят на фронт, и окно он применяет сам.
    """

    user_id: UUID
    transport_types: frozenset[TransportType] | None


@dataclass(frozen=True, slots=True)
class MovementConnection:
    """
    Стрелка на карте перемещений: откуда и куда пользователь ездил, без повторов.

    ``years`` — годы поездок по этому маршруту, по возрастанию.
    """

    origin: GeoPoint
    destination: GeoPoint
    years: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class MovementsMapResult:
    """
    Карта перемещений: маршруты поездок на выбранном транспорте, с годами поездок.

    ``first_year`` и ``last_year`` — годы первой и последней поездки пользователя без учёта
    транспорта, ``None`` — поездок нет.
    """

    first_year: int | None
    last_year: int | None
    connections: tuple[MovementConnection, ...]


@dataclass(frozen=True, slots=True)
class JourneyFilters:
    """
    Фильтр ленты поездок.

    Годы — включительно, ``None`` — без границы. ``transport_types`` — виды транспорта, поездки на
    которых учитываются; ``None`` — все.
    """

    year_from: int | None
    year_to: int | None
    transport_types: frozenset[TransportType] | None


@dataclass(frozen=True, slots=True)
class ListJourneysCommand:
    """Какую страницу ленты поездок отдать и с каким фильтром."""

    user_id: UUID
    page: PageQuery
    filters: JourneyFilters


@dataclass(frozen=True, slots=True)
class JourneyFeedItem:
    """Поездка в ленте. Названий мест нет: фронт запрашивает их у geo по ``place_id``."""

    journey_id: UUID
    origin: GeoPoint
    destination: GeoPoint
    transport_type: TransportType
    traveled_year: int
    distance_km: int


@dataclass(frozen=True, slots=True)
class ListJourneysResult(CursorPage[JourneyFeedItem]):
    """
    Страница ленты поездок.

    Порядок — свежий год сверху, внутри года — порядок, заданный пользователем.
    """


@dataclass(frozen=True, slots=True)
class JourneyYearsResult:
    """Годы, в которые пользователь ездил, по возрастанию — без учёта фильтров ленты."""

    years: tuple[int, ...]
