from typing import Final

from app.auth.exceptions import EmailAlreadyExistError, TermsNotAcceptedError, UsernameAlreadyExistError
from app.shared.exceptions import ErrorResponse, ServerError
from app.shared.exceptions.examples import error_response_example
from app.shared.types import DictStrAny

REGISTER_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    400: {
        "description": "Ошибка валидации",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(TermsNotAcceptedError),
            }
        },
    },
    409: {
        "description": "Email или username уже заняты",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "examples": {
                    "auth.email_already_registered": {
                        "summary": "Email уже зарегистрирован",
                        "value": error_response_example(EmailAlreadyExistError),
                    },
                    "auth.username_already_taken": {
                        "summary": "Username уже занят",
                        "value": error_response_example(UsernameAlreadyExistError),
                    },
                },
            }
        },
    },
    500: {
        "description": "Внутренняя ошибка сервера",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(ServerError),
            }
        },
    },
}
