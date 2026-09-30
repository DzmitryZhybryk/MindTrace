from typing import Annotated
from uuid import UUID

from pydantic import Field

from app.journeys.domain.enums import TransportType
from app.shared.schemas import CamelModel


class PlaceRef(CamelModel):
    """Место из выдачи поиска geo: его ``placeId``, страна и координаты."""

    place_id: UUID
    country_code: Annotated[str, Field(min_length=2, max_length=2)]
    latitude: Annotated[float, Field(ge=-90, le=90)]
    longitude: Annotated[float, Field(ge=-180, le=180)]


class CreateJourneyRequest(CamelModel):
    """
    Тело запроса создания поездки.

    Дата частями: год обязателен, месяц и день — нет. Корректность даты и то, что
    отправление не совпадает с назначением, проверяет домен — поэтому ошибки приходят
    с кодами ``journeys.*``, а не 422.
    """

    origin: PlaceRef
    destination: PlaceRef
    transport_type: TransportType
    traveled_year: int
    traveled_month: int | None = None
    traveled_day: int | None = None


class MapCity(CamelModel):
    """Город на карте путешествий: его ``placeId``, координаты и годы визитов по возрастанию."""

    place_id: UUID
    latitude: float
    longitude: float
    years: list[int]


class MapCountry(CamelModel):
    """
    Посещённая страна на карте: код ISO alpha-2 и список посещённых в ней городов.

    Имя страны не отдаём — фронт резолвит из кода через ``Intl.DisplayNames``. Статуса в
    контракте нет: эндпоинт по смыслу возвращает только посещённые страны (wishlist
    запрашивается отдельно), поэтому сам факт прихода из journeys = страна посещена.
    """

    country_code: str
    cities: list[MapCity]


class JourneysMapResponse(CamelModel):
    """Ответ карты путешествий: посещённые страны с городами и годами визитов."""

    countries: list[MapCountry]
