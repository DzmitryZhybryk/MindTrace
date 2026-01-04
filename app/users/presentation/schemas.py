from typing import Annotated, Self

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.users.exceptions import PasswordsDoNotMatchError

__all__ = [
    "RegisterUserRequest",
]


class RegisterUserRequest(BaseModel):
    """Схема запроса регистрации пользователя. Включает валидацию подтверждения пароля."""

    username: str
    email: EmailStr
    password: Annotated[str, Field(min_length=5)]
    confirm_password: str

    @model_validator(mode="after")
    def validate_passwords_match(self) -> Self:
        """Проверяет, что password и confirm_password совпадают."""
        if self.password != self.confirm_password:
            raise PasswordsDoNotMatchError()

        return self
