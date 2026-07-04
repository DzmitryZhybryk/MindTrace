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
# города одной страны — имя без учёта регистра (casefold) → накопленные визиты.
type VisitsByCity = dict[str, CityVisitAccumulator]
# страны пользователя — ISO alpha-2 код → города этой страны.
type VisitsByCountry = dict[str, VisitsByCity]


@dataclass(frozen=True, slots=True)
class PlaceSnapshot:
    """
    Снапшот места из тела запроса (payload-on-create) — данные для одной точки маршрута.

    Поездка сохраняет именно эти данные (имя/страна/координаты), а не резолвит их по id из
    справочника. Транспортный объект без валидации/семантических типов → dataclass (см. DTO
    conventions); форму (длины/диапазоны координат) валидирует presentation на HTTP-границе.
    """

    name: str
    country_code: str
    latitude: float
    longitude: float


@dataclass(frozen=True, slots=True)
class CreateJourneyCommand:
    """
    Намерение «создать поездку» — вход ``JourneyService.create_journey``.

    Места приходят снапшотом в теле запроса (``origin``/``destination`` — ``PlaceSnapshot``),
    дата — частями (год обяз., месяц/день опц.; дефолты живут на ``CreateJourneyRequest``,
    сюда значение всегда приходит из него). Транспортный объект без валидации → dataclass.
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
    Посещённый город как точка на карте путешествий — выход ``JourneyService.get_journeys_map``.

    ``years`` — отсортированные по возрастанию годы визитов в этот город (по всем поездкам,
    где он был origin или destination). Имя города отдаётся как сохранённый снапшот; локаль
    топонима фронт не резолвит (стандартного кода у городов нет, см. country-code-contract).
    Транспортный объект без валидации/семантических типов → dataclass.
    """

    name: str
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


