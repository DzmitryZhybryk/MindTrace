from functools import cache

from pydantic import BaseModel, ConfigDict

from app.shared.settings import settings


class AuthServiceSettings(BaseModel):
    """Узкий конфиг auth-сервиса — только те значения, что реально нужны use case'ам."""

    model_config = ConfigDict(frozen=True)

    refresh_token_ttl_days: int
    email_verification_ttl_minutes: int
    email_verification_max_attempts: int
    email_verification_resend_cooldown_seconds: int


@cache
def get_auth_service_settings() -> AuthServiceSettings:
    """
    Строит ``AuthServiceSettings`` из глобального ``Settings`` и кэширует результат.

    Возвращает singleton: первый вызов читает поля из глобального
    ``settings``, последующие — отдают тот же объект. Тестируемость
    сохраняется через ``app.dependency_overrides`` на dependency-обёртке.
    """
    return AuthServiceSettings(
        refresh_token_ttl_days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS,
        email_verification_ttl_minutes=settings.EMAIL_VERIFICATION_TTL_MINUTES,
        email_verification_max_attempts=settings.EMAIL_VERIFICATION_MAX_ATTEMPTS,
        email_verification_resend_cooldown_seconds=settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    )
