from typing import Final

from app.auth.exceptions import InvalidAccessTokenError
from app.journeys.exceptions import (
    InvalidJourneyDateError,
    JourneyDateInFutureError,
    SameOriginAndDestinationError,
)
from app.shared.exceptions import ErrorResponse, InternalError
from app.shared.exceptions.examples import error_response_example
from app.shared.types import DictStrAny

CREATE_JOURNEY_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    400: {
        "description": "Ошибка валидации поездки",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "examples": {
                    "journeys.same_origin_destination": {
                        "summary": "Город отправления и назначения совпадают",
                        "value": error_response_example(SameOriginAndDestinationError),
                    },
                    "journeys.date_in_future": {
                        "summary": "Дата поездки в будущем",
                        "value": error_response_example(JourneyDateInFutureError),
                    },
                    "journeys.invalid_date": {
                        "summary": "Некорректная дата (например 30 февраля или день без месяца)",
                        "value": error_response_example(InvalidJourneyDateError),
                    },
                },
            }
        },
    },
    401: {
        "description": "Невалидный или истёкший access-токен",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(InvalidAccessTokenError),
            }
        },
    },
    500: {
        "description": "Внутренняя ошибка сервера",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(InternalError),
            }
        },
    },
}
