from typing import Final

from app.auth.exceptions import (
    ChallengeAttemptsExceededError,
    ChallengeExpiredError,
    ChallengeNotFoundError,
    ChallengeResendCooldownError,
    EmailAlreadyExistError,
    EmailAlreadyVerifiedError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    TermsNotAcceptedError,
    UserCredentialsNotFoundError,
    UsernameAlreadyExistError,
    VerificationCodeInvalidError,
)
from app.shared.exceptions import ErrorResponse, InternalError
from app.shared.exceptions.examples import error_response_example
from app.shared.infra.jwt import InvalidAccessTokenError
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
                "example": error_response_example(InternalError),
            }
        },
    },
}


LOGIN_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    401: {
        "description": "Неверные учётные данные",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(InvalidCredentialsError),
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


LOGOUT_RESPONSES: Final[dict[int | str, DictStrAny]] = {
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


REFRESH_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    401: {
        "description": "Невалидный или истёкший refresh-токен",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(InvalidRefreshTokenError),
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


SEND_EMAIL_VERIFICATION_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    401: {
        "description": "Невалидный или истёкший access-токен",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(InvalidAccessTokenError),
            }
        },
    },
    404: {
        "description": "Учётная запись не найдена",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(UserCredentialsNotFoundError),
            }
        },
    },
    409: {
        "description": "Email уже подтверждён",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(EmailAlreadyVerifiedError),
            }
        },
    },
    429: {
        "description": "Cooldown повторной отправки кода ещё не истёк",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(ChallengeResendCooldownError),
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


VERIFY_EMAIL_RESPONSES: Final[dict[int | str, DictStrAny]] = {
    400: {
        "description": "Неверный код подтверждения",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(VerificationCodeInvalidError),
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
    404: {
        "description": "Учётная запись или активный challenge не найдены",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "examples": {
                    "auth.user_credentials_not_found": {
                        "summary": "Учётная запись не найдена",
                        "value": error_response_example(UserCredentialsNotFoundError),
                    },
                    "auth.challenge_not_found": {
                        "summary": "Активный challenge отсутствует",
                        "value": error_response_example(ChallengeNotFoundError),
                    },
                },
            }
        },
    },
    409: {
        "description": "Email уже подтверждён",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(EmailAlreadyVerifiedError),
            }
        },
    },
    410: {
        "description": "Срок действия кода истёк",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(ChallengeExpiredError),
            }
        },
    },
    429: {
        "description": "Превышено количество попыток ввода кода",
        "model": ErrorResponse,
        "content": {
            "application/json": {
                "example": error_response_example(ChallengeAttemptsExceededError),
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
