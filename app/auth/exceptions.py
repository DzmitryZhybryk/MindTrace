from typing import ClassVar

from app.shared.exceptions import BadRequestError, ConflictError, GoneError, TooManyRequestsError
from app.shared.types import OptionalDict


class TermsNotAcceptedError(BadRequestError):
    code = "auth.terms_not_accepted"
    message = "Необходимо принять пользовательское соглашение"
    details: ClassVar[OptionalDict] = {"field": "terms_accepted"}


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


class VerificationCodeExpiredError(GoneError):
    code = "auth.verification_code_expired"
    message = "Срок действия кода подтверждения истёк"


class VerificationAttemptsExceededError(TooManyRequestsError):
    code = "auth.verification_attempts_exceeded"
    message = "Превышено количество попыток ввода кода"


class VerificationResendCooldownError(TooManyRequestsError):
    code = "auth.verification_resend_cooldown"
    message = "Слишком частая отправка кода, повторите попытку позже"
