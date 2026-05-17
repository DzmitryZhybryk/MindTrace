from functools import cache

from pydantic import BaseModel, ConfigDict

from app.shared.settings import settings


class EmailVerificationSettings(BaseModel):
    """Конфиг email-верификации: TTL кода, лимит попыток, cooldown повторной отправки."""

    model_config = ConfigDict(frozen=True)

    email_verification_ttl_minutes: int
    email_verification_max_attempts: int
    email_verification_resend_cooldown_seconds: int


@cache
def get_email_verification_settings() -> EmailVerificationSettings:
    """
    Строит ``EmailVerificationSettings`` из глобального ``Settings`` и кэширует результат.

    Возвращает singleton: первый вызов читает поля из глобального
    ``settings``, последующие — отдают тот же объект. Тестируемость
    сохраняется через ``app.dependency_overrides`` на dependency-обёртке.
    """
    return EmailVerificationSettings(
        email_verification_ttl_minutes=settings.EMAIL_VERIFICATION_TTL_MINUTES,
        email_verification_max_attempts=settings.EMAIL_VERIFICATION_MAX_ATTEMPTS,
        email_verification_resend_cooldown_seconds=settings.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    )
