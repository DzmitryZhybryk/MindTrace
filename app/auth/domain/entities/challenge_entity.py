import datetime as dt
import secrets
import string
from typing import Final, Self
from uuid import UUID, uuid4

from app.auth.domain.enums import ChallengeType
from app.auth.exceptions import (
    ChallengeAttemptsExceededError,
    ChallengeExpiredError,
    ChallengeResendCooldownError,
)
from app.shared.domain.domain_mixins import TimestampedEntityMixin

_VERIFICATION_CODE_LENGTH: Final[int] = 6


class ChallengeEntity(TimestampedEntityMixin):
    """
    Challenge — одноразовый код, выдаваемый под конкретный сценарий
    (см. ``ChallengeType``): подтверждение email, восстановление пароля и т.п.

    Термин ``challenge`` выбран сознательно, чтобы не путать с access/refresh
    токенами авторизации. Здесь речь о challenge-response верификации:
    backend генерирует «вопрос» (код), пользователь должен ответить тем же
    кодом из письма/SMS.

    Лайфсайкл (TTL, счётчик попыток, использование, cooldown на resend)
    одинаков для всех типов; различается только домен использования —
    откуда `challenge_type` как discriminator.

    Хранит **только хэш** кода — plaintext знают только сервис, который его
    сгенерировал, и пользователь, получивший письмо. Хеширование/верификация
    делаются на стороне application через ``SaltedHasher`` (тот же контракт,
    что и у паролей): сущность об алгоритме не знает.
    """

    def __init__(
        self,
        challenge_id: UUID,
        user_id: UUID,
        challenge_type: ChallengeType,
        code_hash: str,
        expires_at: dt.datetime,
        attempts: int = 0,
        used_at: dt.datetime | None = None,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.challenge_id = challenge_id
        self.user_id = user_id
        self.challenge_type = challenge_type
        self.code_hash = code_hash
        self.expires_at = expires_at
        self.attempts = attempts
        self.used_at = used_at

    @staticmethod
    def generate_code() -> str:
        """
        Генерирует криптостойкий 6-значный числовой код.

        Returns:
            Строка из 6 цифр, равномерно распределённая по `secrets.choice`
        """
        return "".join(secrets.choice(string.digits) for _ in range(_VERIFICATION_CODE_LENGTH))

    @classmethod
    def create(
        cls,
        user_id: UUID,
        challenge_type: ChallengeType,
        code_hash: str,
        ttl_minutes: int,
    ) -> Self:
        """
        Создаёт новый challenge с истечением через ``ttl_minutes`` минут.

        Args:
            user_id: ID пользователя, которому принадлежит challenge
            challenge_type: Сценарий, для которого выпускается challenge
            code_hash: Хэш кода, полученный из ``SaltedHasher.hash``
            ttl_minutes: Срок жизни challenge'а в минутах

        Returns:
            Новая доменная сущность со свежим UUID и `expires_at = now + ttl`
        """
        now = dt.datetime.now(tz=dt.UTC)
        return cls(
            challenge_id=uuid4(),
            user_id=user_id,
            challenge_type=challenge_type,
            code_hash=code_hash,
            expires_at=now + dt.timedelta(minutes=ttl_minutes),
        )

    def is_active(self) -> bool:
        """
        Проверяет, что challenge не использован и не истёк.

        Returns:
            ``True`` если challenge ещё можно использовать, иначе ``False``
        """
        return self.used_at is None and self.expires_at > dt.datetime.now(tz=dt.UTC)

    def ensure_resend_cooldown_passed(self, *, cooldown_seconds: int) -> None:
        """
        Проверяет, что прошло достаточно времени с момента выдачи challenge'а,
        чтобы можно было выпустить новый.

        Используется в resend-флоу: если активный challenge был выпущен слишком
        недавно, нельзя инвалидировать его и сгенерировать новый.

        Args:
            cooldown_seconds: Минимальное число секунд между последовательными
                выдачами кодов одному пользователю

        Raises:
            ChallengeResendCooldownError: Cooldown ещё не истёк
        """
        elapsed_seconds = (dt.datetime.now(tz=dt.UTC) - self.created_at).total_seconds()
        if elapsed_seconds < cooldown_seconds:
            raise ChallengeResendCooldownError()

    def ensure_can_attempt(self, *, max_attempts: int) -> None:
        """
        Проверяет, что challenge пригоден к очередной попытке ввода кода.

        Консолидирует две связанных проверки в один доменный инвариант: challenge
        активен (не истёк и не использован) и лимит попыток не выбран. Любое
        нарушение — это переход, который нельзя совершить, и ответственность
        за защиту лежит на entity, а не на каждом сервисе-вызывающем.

        Args:
            max_attempts: Максимально разрешённое число попыток ввода кода

        Raises:
            ChallengeExpiredError: Challenge истёк или уже использован
            ChallengeAttemptsExceededError: Превышен лимит попыток
        """
        if not self.is_active():
            raise ChallengeExpiredError()

        if self.attempts >= max_attempts:
            raise ChallengeAttemptsExceededError()

    def register_failed_attempt(self) -> None:
        """Увеличивает счётчик неудачных попыток ввода кода на 1."""
        self.attempts += 1
        self._mark_updated()

    def mark_used(self) -> None:
        """Помечает challenge как использованный."""
        self.used_at = dt.datetime.now(tz=dt.UTC)
        self._mark_updated()
