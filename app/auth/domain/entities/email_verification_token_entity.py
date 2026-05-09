import datetime as dt
import secrets
import string
from typing import Final, Self
from uuid import UUID, uuid4

from app.shared.domain.domain_mixins import TimestampedEntityMixin

_VERIFICATION_CODE_LENGTH: Final[int] = 6


class EmailVerificationTokenEntity(TimestampedEntityMixin):
    """
    Сущность одноразового кода подтверждения email.

    Хранит **только хэш** кода — сам plaintext-код знают только сервис, который
    его сгенерировал, и пользователь, получивший письмо. Хеширование/верификация
    выполняются на стороне application через ``SecretHasher`` (тот же контракт,
    что и у паролей): сущность принимает уже готовый хэш и не зависит от
    конкретного алгоритма.
    """

    def __init__(
        self,
        token_id: UUID,
        user_id: UUID,
        code_hash: str,
        expires_at: dt.datetime,
        attempts: int = 0,
        used_at: dt.datetime | None = None,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.token_id = token_id
        self.user_id = user_id
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
        code_hash: str,
        ttl_minutes: int,
    ) -> Self:
        """
        Создаёт новый токен подтверждения с истечением через ``ttl_minutes`` минут.

        Args:
            user_id: ID пользователя, которому принадлежит токен
            code_hash: Хэш кода, полученный из ``SecretHasher.hash``
            ttl_minutes: Срок жизни токена в минутах

        Returns:
            Новая доменная сущность с свежим UUID и `expires_at = now + ttl`
        """
        now = dt.datetime.now(tz=dt.UTC)
        return cls(
            token_id=uuid4(),
            user_id=user_id,
            code_hash=code_hash,
            expires_at=now + dt.timedelta(minutes=ttl_minutes),
        )

    def is_active(self) -> bool:
        """
        Проверяет, что токен не использован и не истёк.

        Returns:
            ``True`` если токен ещё можно использовать, иначе ``False``
        """
        return self.used_at is None and self.expires_at > dt.datetime.now(tz=dt.UTC)

    def can_attempt(self, *, max_attempts: int) -> bool:
        """
        Проверяет, остались ли попытки ввода кода.

        Args:
            max_attempts: Максимально разрешённое число попыток

        Returns:
            ``True`` если число неудачных попыток ещё ниже лимита
        """
        return self.attempts < max_attempts

    def register_failed_attempt(self) -> None:
        """Увеличивает счётчик неудачных попыток ввода кода на 1."""
        self.attempts += 1
        self._mark_updated()

    def mark_used(self) -> None:
        """Помечает токен как использованный."""
        self.used_at = dt.datetime.now(tz=dt.UTC)
        self._mark_updated()
