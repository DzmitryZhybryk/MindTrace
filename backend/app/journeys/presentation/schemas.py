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


class MapCityResponse(CamelModel):
    """Город на карте путешествий: точка (координаты) + годы визитов по возрастанию."""

    name: str
    latitude: float
    longitude: float
    years: list[int]


class MapCountryResponse(CamelModel):
    """
    Посещённая страна на карте: код ISO alpha-2 и список посещённых в ней городов.

    Имя страны не отдаём — фронт резолвит из кода через ``Intl.DisplayNames``. Статуса в
    контракте нет: эндпоинт по смыслу возвращает только посещённые страны (wishlist
    запрашивается отдельно), поэтому сам факт прихода из journeys = страна посещена.
    """

    country_code: str
    cities: list[MapCityResponse]


class JourneysMapResponse(CamelModel):
    """Ответ карты путешествий: посещённые страны с городами и годами визитов."""

    countries: list[MapCountryResponse]
