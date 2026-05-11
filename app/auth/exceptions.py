from typing import ClassVar

from app.shared.exceptions import (
    BadRequestError,
    ConflictError,
    GoneError,
    NotFoundError,
    TooManyRequestsError,
    UnauthorizedError,
)
from app.shared.types import OptionalDict


class TermsNotAcceptedError(BadRequestError):
    code = "auth.terms_not_accepted"
    message = "Необходимо принять пользовательское соглашение"
    details: ClassVar[OptionalDict] = {"field": "terms_accepted"}


class InvalidAccessTokenError(UnauthorizedError):
    code = "auth.invalid_access_token"
    message = "Невалидный или истёкший access-токен"


class InvalidCredentialsError(UnauthorizedError):
    code = "auth.invalid_credentials"
    message = "Неверный логин или пароль"


class InvalidRefreshTokenError(UnauthorizedError):
    code = "auth.invalid_refresh_token"
    message = "Невалидный или истёкший refresh-токен"


class UserCredentialsNotFoundError(NotFoundError):
    code = "auth.user_credentials_not_found"
    message = "Учётная запись не найдена"


class EmailAlreadyExistError(ConflictError):
    code = "auth.email_already_registered"
    message = "Пользователь с таким email уже существует"
    details: ClassVar[OptionalDict] = {"field": "email"}


class UsernameAlreadyExistError(ConflictError):
    code = "auth.username_already_taken"
    message = "Пользователь с таким username уже существует"
    details: ClassVar[OptionalDict] = {"field": "username"}


class EmailAlreadyVerifiedError(ConflictError):
    code = "auth.email_already_verified"
    message = "Email уже подтверждён"


class VerificationCodeInvalidError(BadRequestError):
    code = "auth.verification_code_invalid"
    message = "Неверный код подтверждения"
    details: ClassVar[OptionalDict] = {"field": "code"}


class ChallengeNotFoundError(NotFoundError):
    code = "auth.challenge_not_found"
    message = "Код подтверждения не запрошен или больше недоступен"


class ChallengeExpiredError(GoneError):
    code = "auth.challenge_expired"
    message = "Срок действия кода подтверждения истёк"


class ChallengeAttemptsExceededError(TooManyRequestsError):
    code = "auth.challenge_attempts_exceeded"
    message = "Превышено количество попыток ввода кода"


class ChallengeResendCooldownError(TooManyRequestsError):
    code = "auth.challenge_resend_cooldown"
    message = "Слишком частая отправка кода, повторите попытку позже"
