from typing import ClassVar

from app.shared.exceptions import InvalidInputError
from app.shared.types import OptionalDict


class SameOriginAndDestinationError(InvalidInputError):
    code = "journeys.same_origin_destination"
    message = "Город отправления и назначения не могут совпадать"


class JourneyDateInFutureError(InvalidInputError):
    code = "journeys.date_in_future"
    message = "Дата поездки не может быть в будущем"
    # ``field`` — имя поля ФОРМЫ (фронтовый routing-хинт для setFieldError), а не имя
    # поля wire-пейлоада (traveled_year): на форме дата привязана к полю ``year``.
    default_details: ClassVar[OptionalDict] = {"field": "year"}


class InvalidJourneyDateError(InvalidInputError):
    code = "journeys.invalid_date"
    message = "Некорректная дата поездки"
    default_details: ClassVar[OptionalDict] = {"field": "year"}
