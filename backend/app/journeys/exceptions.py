from typing import ClassVar

from app.shared.exceptions import InvalidInputError
from app.shared.types import OptionalDict


class SameOriginAndDestinationError(InvalidInputError):
    code = "journeys.same_origin_destination"
    message = "Город отправления и назначения не могут совпадать"


class UnknownPlaceError(InvalidInputError):
    code = "journeys.unknown_place"
    message = "Место не найдено"


class JourneyDateInFutureError(InvalidInputError):
    code = "journeys.date_in_future"
    message = "Год поездки не может быть в будущем"
    # Фронт показывает ошибку под полем формы с этим именем; в форме год называется `year`, не `traveledYear`.
    default_details: ClassVar[OptionalDict] = {"field": "year"}
