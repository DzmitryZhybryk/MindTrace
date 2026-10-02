from dataclasses import dataclass
from uuid import UUID

from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint

__all__ = [
    "CreateJourneyCommand",
    "GetMovementsMapCommand",
    "JourneysGlobeResult",
    "JourneysMapResult",
    "MapCityVisit",
    "MapCountryVisits",
    "MovementConnection",
    "MovementsMapResult",
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
