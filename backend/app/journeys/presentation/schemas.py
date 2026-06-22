from typing import Annotated

from pydantic import Field

from app.journeys.domain.enums import TransportType
from app.shared.schemas import CamelModel


class PlaceRef(CamelModel):
    """
    Снапшот места в теле запроса (payload-on-create): имя/страна/координаты.

    Поездка сохраняет эти данные как есть, ссылки на справочник не шлём. Валидируется
    только ФОРМА (длины, диапазоны координат) — это HTTP-граница; семантики тут нет.
    """

    name: Annotated[str, Field(min_length=1, max_length=200)]
    country_code: Annotated[str, Field(min_length=2, max_length=2)]
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]


class CreateJourneyRequest(CamelModel):
    """
    Тело запроса создания поездки.

    Места приходят снапшотом (``origin``/``destination`` — имя/страна/координаты), бэк их
    не резолвит. Дата частями: год обязателен, месяц/день опциональны. Семантику даты
    (month 1..12, day валиден и требует month, не будущее) и инвариант origin≠destination
    валидирует домен — отсюда консистентные доменные коды ошибок (``journeys.*``), а не 422.
    """

    origin: PlaceRef
    destination: PlaceRef
    transport_type: TransportType
    traveled_year: int
    traveled_month: int | None = None
    traveled_day: int | None = None
