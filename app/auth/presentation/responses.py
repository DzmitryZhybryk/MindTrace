from typing import Final

from app.auth.exceptions import (
    EmailAlreadyExistError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    TermsNotAcceptedError,
    UsernameAlreadyExistError,
)
from app.shared.exceptions import ErrorResponse, ServerError
from app.shared.exceptions.examples import error_response_example
from app.shared.types import DictStrAny

_SERVER_ERROR_RESPONSE: Final[DictStrAny] = {
    "description": "Внутренняя ошибка сервера",
    "model": ErrorResponse,
    "content": {
        "application/json": {
            "example": error_response_example(ServerError),
        }
    },
}

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
    500: _SERVER_ERROR_RESPONSE,
}

LOGIN_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    401: {
        "description": "Неверный логин или пароль",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(InvalidCredentialsError),
            }
        },
    },
    500: _SERVER_ERROR_RESPONSE,
}

LOGOUT_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    500: _SERVER_ERROR_RESPONSE,
}

REFRESH_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    401: {
        "description": "Refresh-токен недействителен или истёк",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(InvalidRefreshTokenError),
            }
        },
    },
    500: _SERVER_ERROR_RESPONSE,
}
