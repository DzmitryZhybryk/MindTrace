from typing import ClassVar

from app.shared.exceptions import BadRequestError, ConflictError, UnauthorizedError
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


class InvalidCredentialsError(UnauthorizedError):
    code = "auth.invalid_credentials"
    message = "Неверный логин или пароль"


class InvalidRefreshTokenError(UnauthorizedError):
    code = "auth.invalid_refresh_token"
    message = "Refresh-токен недействителен или истёк"
