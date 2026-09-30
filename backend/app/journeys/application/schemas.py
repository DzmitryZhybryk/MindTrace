from dataclasses import dataclass, field
from uuid import UUID

from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint

__all__ = [
    "CityVisitAccumulator",
    "CreateJourneyCommand",
    "JourneysMapResult",
    "MapCityVisit",
    "MapCountryVisits",
    "PlaceSnapshot",
    "VisitsByCity",
    "VisitsByCountry",
]


# Промежуточные структуры свёртки ``JourneyService.get_journeys_map`` (наружу не отдаются):
# города одной страны — id места → накопленные визиты.
type VisitsByCity = dict[UUID, CityVisitAccumulator]
# страны пользователя — ISO alpha-2 код → города этой страны.
type VisitsByCountry = dict[str, VisitsByCity]


@dataclass(frozen=True, slots=True)
class PlaceSnapshot:
    """Место отправления или назначения, выбранное пользователем в справочнике geo."""

    place_id: UUID
    country_code: str
    latitude: float
    longitude: float


@dataclass(frozen=True, slots=True)
class CreateJourneyCommand:
    """
    Данные для создания поездки.

    Дата приходит частями: год обязателен, месяц и день — нет.
    """

    user_id: UUID
    origin: PlaceSnapshot
    destination: PlaceSnapshot
    transport_type: TransportType
    traveled_year: int
    traveled_month: int | None
    traveled_day: int | None


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


@dataclass(slots=True)
class CityVisitAccumulator:
    """
    Мутабельный накопитель визитов в один город при свёртке поездок в карту.

    В отличие от остальных схем модуля — **не** frozen: ``years`` пополняется по мере обхода
    поездок (один город встречается как origin/destination разных поездок). Внутренний тип
    агрегации ``JourneyService.get_journeys_map``, наружу не отдаётся — итог свёртки
    складывается во frozen ``MapCityVisit``.
    """

    point: GeoPoint
    years: set[int] = field(default_factory=set)
