"""Исключения домена users."""

from app.shared.exceptions import BadRequestError


class PasswordsDoNotMatchError(BadRequestError):
    """
    Исключение, возникающее когда пароль и подтверждение пароля не совпадают.

    Используется в presentation слое для валидации HTTP запросов.
    """

    code = "passwords_do_not_match"
    message = "Пароли не совпадают"
