from typing import Annotated, Self
from uuid import UUID

from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError

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
    Фильтры карты перемещений (query-параметры).

    Границы лет включительные, без параметра — без границы. ``transportType`` повторяется
    по разу на вид транспорта; без него учитываются все.
    """

    year_from: int | None = None
    year_to: int | None = None
    transport_type: frozenset[TransportType] | None = None

    @model_validator(mode="after")
    def validate_year_range(self) -> Self:
        """
        Проверяет, что окно лет не перевёрнуто.

        Порядок границ — свойство самого запроса, поэтому ошибка — общая ``validation_error``
        (422), без доменного кода.

        Returns:
            Сам валидируемый объект (контракт ``model_validator(mode="after")``)

        Raises:
            PydanticCustomError: ``yearFrom`` больше ``yearTo``
        """
        if self.year_from is not None and self.year_to is not None and self.year_from > self.year_to:
            raise PydanticCustomError("inverted_year_range", "yearFrom не может быть больше yearTo")

        return self


class MovementConnection(CamelModel):
    """Стрелка на карте перемещений: откуда и куда пользователь ездил."""

    origin: MapPoint
    destination: MapPoint


class MovementsMapResponse(CamelModel):
    """
    Ответ карты перемещений: маршруты поездок в окне фильтров, каждый «откуда → куда» один раз.

    ``firstYear`` / ``lastYear`` — годы первой и последней поездки без учёта фильтров;
    ``null``, если поездок нет.
    """

    first_year: int | None
    last_year: int | None
    connections: list[MovementConnection]
