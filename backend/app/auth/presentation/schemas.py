from typing import Annotated, Self

from pydantic import BaseModel, EmailStr, Field, SecretStr, model_validator

from app.auth.exceptions import TermsNotAcceptedError


class RegisterRequest(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=50)]
    email: Annotated[EmailStr, Field(max_length=254)]
    password: Annotated[SecretStr, Field(min_length=8, max_length=50)]
    terms_accepted: bool
    marketing_emails_consent: bool

    @model_validator(mode="after")
    def validate_terms(self) -> Self:
        """
        Проверяет, что пользователь принял условия использования.

        Запускается на границе HTTP-слоя сразу после парсинга тела запроса.
        Если флаг не выставлен, регистрация останавливается ещё до выхода в
        application-слой — фактический момент принятия условий фиксируется
        в роуте через ``terms_accepted_at`` и пробрасывается дальше для аудита.

        Pydantic v2 оборачивает в ``ValidationError`` только ``ValueError``/
        ``AssertionError``/``PydanticCustomError``; ``TermsNotAcceptedError``
        (наследник ``BaseDomainError`` с категорией ``INVALID_INPUT``)
        пробрасывается наружу как есть и ловится глобальным exception handler'ом →
        HTTP 400 с правильным ``code`` по доменной категории, а не 422 от FastAPI.

        Returns:
            Сам валидируемый объект (контракт ``model_validator(mode="after")``)

        Raises:
            TermsNotAcceptedError: Если ``terms_accepted`` равен ``False``
        """
        if not self.terms_accepted:
            raise TermsNotAcceptedError()

        return self


class LoginRequest(BaseModel):
    # На login пароль/логин на длину/политику не валидируем — проверяем лишь, что
    # они непустые и в пределах max. Иначе юзер со «старым» коротким паролем
    # залочится на входе; неверные креды и так дадут 401, а не 422.
    login: Annotated[str, Field(min_length=1, max_length=254)]
    password: Annotated[SecretStr, Field(min_length=1, max_length=50)]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105


class VerifyEmailRequest(BaseModel):
    code: Annotated[str, Field(pattern=r"^\d{6}$")]
