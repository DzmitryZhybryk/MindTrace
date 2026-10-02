import datetime as dt
from typing import Annotated, Self
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.journeys.domain.enums import TransportType
from app.journeys.exceptions import JourneyDateInFutureError, SameOriginAndDestinationError
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

    Год не может быть в будущем (по UTC), отправление не может совпадать с назначением. Нарушения —
    ошибки с кодами ``journeys.*``, а не 422.
    """

    origin: PlaceRef
    destination: PlaceRef
    transport_type: TransportType
    traveled_year: Annotated[int, Field(ge=1)]

    @field_validator("traveled_year")
    @classmethod
    def validate_year_not_in_future(cls, traveled_year: int) -> int:
        """
        Отклоняет год из будущего.

        Бросает доменную ошибку, а не ``ValueError``: pydantic превращает в 422 только ``ValueError``,
        ``AssertionError`` и ``PydanticCustomError``, остальные исключения доходят до общего обработчика
        со своим кодом.
        """
        if traveled_year > dt.datetime.now(tz=dt.UTC).year:
            raise JourneyDateInFutureError()

        return traveled_year

    @model_validator(mode="after")
    def validate_distinct_endpoints(self) -> Self:
        """Отклоняет поездку в то же место; места сравниваются по ``placeId``, не по координатам."""
        if self.origin.place_id == self.destination.place_id:
            raise SameOriginAndDestinationError()

        return self


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
    """
    Ответ карты путешествий: посещённые страны с городами и годами визитов.

    Каждое место встречается ровно один раз, в одной стране.
    """

    countries: list[MapCountry]


class MapPoint(CamelModel):
    """Место на глобусе или карте перемещений: его ``placeId`` и координаты, без названия."""

    place_id: UUID
    latitude: float
    longitude: float


class JourneysGlobeResponse(CamelModel):
    """Ответ глобуса: места, где пользователь побывал, каждое ровно один раз."""

    places: list[MapPoint]


class MovementsMapFilterRequest(CamelModel):
    """
    Фильтр карты перемещений (query-параметры).

    ``transportType`` повторяется по разу на вид транспорта; без него учитываются все.
    Окна лет нет: годы приходят в каждом маршруте, окно применяет фронт.
    """

    transport_type: frozenset[TransportType] | None = None


class MovementConnection(CamelModel):
    """Стрелка на карте перемещений: откуда и куда пользователь ездил и в какие годы, по возрастанию."""

    origin: MapPoint
    destination: MapPoint
    years: list[int]


class MovementsMapResponse(CamelModel):
    """
    Ответ карты перемещений: маршруты поездок на выбранном транспорте, каждый «откуда → куда»
    один раз, с годами поездок.

    ``firstYear`` / ``lastYear`` — годы первой и последней поездки без учёта транспорта;
    ``null``, если поездок нет.
    """

    first_year: int | None
    last_year: int | None
    connections: list[MovementConnection]
