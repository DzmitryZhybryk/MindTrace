import datetime as dt
from typing import Annotated, Self
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from app.journeys.domain.enums import TransportType
from app.journeys.exceptions import InvalidYearRangeError, JourneyDateInFutureError, SameOriginAndDestinationError
from app.shared.fractional_index import MovePlacement
from app.shared.pagination import CursorPageRequest, CursorPageResponse
from app.shared.schemas import CamelModel

type Latitude = Annotated[float, Field(ge=-90, le=90)]
type Longitude = Annotated[float, Field(ge=-180, le=180)]


class PlaceRef(CamelModel):
    """Место из выдачи поиска geo: его ``placeId``, страна и координаты."""

    place_id: UUID
    country_code: Annotated[str, Field(min_length=2, max_length=2)]
    latitude: Latitude
    longitude: Longitude


class BaseJourneyRequest(CamelModel):
    """
    Поля поездки и их правила — общие для создания и правки.

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


class CreateJourneyRequest(BaseJourneyRequest):
    """Тело запроса создания поездки."""


class UpdateJourneyRequest(BaseJourneyRequest):
    """Тело запроса правки поездки: новые значения всех полей."""


class MoveJourneyRequest(CamelModel):
    """Куда перенести поездку: после или перед поездкой-соседом."""

    neighbor_journey_id: UUID
    placement: MovePlacement


class MoveJourneyResponse(CamelModel):
    """Год поездки после переноса: он берётся от соседа и может смениться."""

    model_config = ConfigDict(frozen=True)

    traveled_year: int


class JourneyDistanceRequest(CamelModel):
    """Координаты концов маршрута (query-параметры)."""

    origin_latitude: Latitude
    origin_longitude: Longitude
    destination_latitude: Latitude
    destination_longitude: Longitude


class JourneyDistanceResponse(CamelModel):
    """Расстояние маршрута по большой окружности, км — то же, что поездка сохранит."""

    model_config = ConfigDict(frozen=True)

    distance_km: int


class JourneysFeedRequest(CursorPageRequest):
    """
    Страница ленты поездок и её фильтр (query-параметры).

    ``yearFrom`` / ``yearTo`` — включительно, один год — обе границы равны. ``transportType``
    повторяется по разу на вид транспорта; без него — все.
    """

    year_from: Annotated[int | None, Field(ge=1)] = None
    year_to: Annotated[int | None, Field(ge=1)] = None
    transport_type: frozenset[TransportType] | None = None

    @model_validator(mode="after")
    def validate_year_range(self) -> Self:
        """Отклоняет диапазон лет, где начало позже конца."""
        if self.year_from is not None and self.year_to is not None and self.year_from > self.year_to:
            raise InvalidYearRangeError()

        return self


class JourneyPlace(CamelModel):
    """Место поездки: его ``placeId``, страна и координаты, без названия."""

    model_config = ConfigDict(frozen=True)

    place_id: UUID
    country_code: str
    latitude: float
    longitude: float


class JourneyFeedEntry(CamelModel):
    """Поездка в ленте."""

    model_config = ConfigDict(frozen=True)

    journey_id: UUID
    origin: JourneyPlace
    destination: JourneyPlace
    transport_type: TransportType
    traveled_year: int
    distance_km: int


class JourneysFeedResponse(CursorPageResponse[JourneyFeedEntry]):
    """Страница ленты поездок: свежий год сверху, внутри года — порядок пользователя."""


class JourneyYearsResponse(CamelModel):
    """Годы, в которые пользователь ездил, по возрастанию, без повторов — без учёта фильтров ленты."""

    model_config = ConfigDict(frozen=True)

    years: tuple[int, ...]


class MapCity(CamelModel):
    """Город на карте путешествий: его ``placeId``, координаты и годы визитов по возрастанию."""

    model_config = ConfigDict(frozen=True)

    place_id: UUID
    latitude: float
    longitude: float
    years: tuple[int, ...]


class MapCountry(CamelModel):
    """
    Посещённая страна на карте: код ISO alpha-2 и список посещённых в ней городов.

    Имя страны не отдаём — фронт резолвит из кода через ``Intl.DisplayNames``. Статуса в
    контракте нет: эндпоинт по смыслу возвращает только посещённые страны (wishlist
    запрашивается отдельно), поэтому сам факт прихода из journeys = страна посещена.
    """

    model_config = ConfigDict(frozen=True)

    country_code: str
    cities: tuple[MapCity, ...]


class JourneysMapResponse(CamelModel):
    """
    Ответ карты путешествий: посещённые страны с городами и годами визитов.

    Каждое место встречается ровно один раз, в одной стране.
    """

    model_config = ConfigDict(frozen=True)

    countries: tuple[MapCountry, ...]


class MapPoint(CamelModel):
    """Место на глобусе или карте перемещений: его ``placeId`` и координаты, без названия."""

    model_config = ConfigDict(frozen=True)

    place_id: UUID
    latitude: float
    longitude: float


class JourneysGlobeResponse(CamelModel):
    """Ответ глобуса: места, где пользователь побывал, каждое ровно один раз."""

    model_config = ConfigDict(frozen=True)

    places: tuple[MapPoint, ...]


class MovementsMapFilterRequest(CamelModel):
    """
    Фильтр карты перемещений (query-параметры).

    ``transportType`` повторяется по разу на вид транспорта; без него учитываются все.
    Окна лет нет: годы приходят в каждом маршруте, окно применяет фронт.
    """

    transport_type: frozenset[TransportType] | None = None


class MovementConnection(CamelModel):
    """Стрелка на карте перемещений: откуда и куда пользователь ездил и в какие годы, по возрастанию."""

    model_config = ConfigDict(frozen=True)

    origin: MapPoint
    destination: MapPoint
    years: tuple[int, ...]


class MovementsMapResponse(CamelModel):
    """
    Ответ карты перемещений: маршруты поездок на выбранном транспорте, каждый «откуда → куда»
    один раз, с годами поездок.

    ``firstYear`` / ``lastYear`` — годы первой и последней поездки без учёта транспорта;
    ``null``, если поездок нет.
    """

    model_config = ConfigDict(frozen=True)

    first_year: int | None
    last_year: int | None
    connections: tuple[MovementConnection, ...]
