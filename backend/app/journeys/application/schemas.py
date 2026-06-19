from dataclasses import dataclass
from uuid import UUID

from app.journeys.domain.enums import TransportType

__all__ = ["CreateJourneyCommand", "PlaceSnapshot"]


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
