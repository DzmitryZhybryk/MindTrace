from uuid import UUID

from app.auth.application.ports import AuthUnitOfWorkPort
from app.auth.application.settings import EmailVerificationSettings
from app.auth.domain.entities import ChallengeEntity
from app.auth.domain.enums import ChallengeType
from app.auth.exceptions import (
    ChallengeNotFoundError,
    UserCredentialsNotFoundError,
    VerificationCodeInvalidError,
)
from app.auth.infra.tasks import send_verification_email
from app.shared.infra.crypto import SaltedHasherPort
from app.shared.infra.procrastinate import TaskBusPort


class EmailVerificationService:
    def __init__(
        self,
        uow: AuthUnitOfWorkPort,
        salted_hasher: SaltedHasherPort,
        task_bus: TaskBusPort,
        email_verification_settings: EmailVerificationSettings,
    ) -> None:
        self._uow = uow
        self._salted_hasher = salted_hasher
        self._task_bus = task_bus
        self._email_verification_settings = email_verification_settings

    async def request_email_verification(self, user_id: UUID) -> None:
        """
        Создаёт код подтверждения email и атомарно ставит таску на его отправку.

        Если у пользователя уже есть активный challenge типа email_verification
        и cooldown не истёк — отказывает с ``ChallengeResendCooldownError``.
        Иначе старый challenge переводится в ``used_at = now()`` (партиальный
        unique-индекс по ``WHERE used_at IS NULL`` пропустит вставку нового),
        создаётся новый и его plaintext уходит в письмо через procrastinate-таску.

        Defer таски и INSERT нового challenge'а коммитятся одной транзакцией —
        невозможно состояние «в БД challenge есть, в очереди job'а нет» (или
        наоборот).

        Args:
            user_id: ID пользователя, которому нужен код

        Raises:
            UserCredentialsNotFoundError: Если учётной записи с таким ``user_id`` не существует
            EmailAlreadyVerifiedError: Если email уже подтверждён
            ChallengeResendCooldownError: Если активный challenge ещё свежее cooldown'а
        """
        credentials = await self._uow.user_credentials_repository.find_user_credentials_by_user_id(user_id=user_id)
        if credentials is None:
            raise UserCredentialsNotFoundError()

        credentials.ensure_not_verified()

        existing_challenge = await self._uow.challenge_repository.find_active_challenge_for_update(
            user_id=user_id,
            challenge_type=ChallengeType.EMAIL_VERIFICATION,
        )
        if existing_challenge is not None:
            existing_challenge.ensure_resend_cooldown_passed(
                cooldown_seconds=self._email_verification_settings.email_verification_resend_cooldown_seconds,
            )
            existing_challenge.mark_used()
            await self._uow.challenge_repository.update_challenge_by_id(challenge=existing_challenge)

        code = ChallengeEntity.generate_code()
        new_challenge = ChallengeEntity.create(
            user_id=user_id,
            challenge_type=ChallengeType.EMAIL_VERIFICATION,
            code_hash=self._salted_hasher.hash(code),
            ttl_minutes=self._email_verification_settings.email_verification_ttl_minutes,
        )
        await self._uow.challenge_repository.insert_challenge(challenge=new_challenge)

        await self._task_bus.bind_to(self._uow.session).defer(
            task=send_verification_email,
            lock=f"email_verification:user:{user_id}",
            user_id=str(user_id),
            email=credentials.email,
            code=code,
        )
        await self._uow.commit()

    async def verify_email(self, user_id: UUID, code: str) -> None:
        """
        Проверяет одноразовый код и помечает email пользователя подтверждённым.

        Активный challenge берётся под ``SELECT ... FOR UPDATE`` — параллельные
        попытки ввода кода сериализуются и не теряют инкремент счётчика. На
        неверном коде счётчик неудачных попыток увеличивается; при превышении
        лимита challenge дальше не принимается до выпуска нового.

        Args:
            user_id: ID пользователя
            code: Plaintext-код, который пользователь ввёл

        Raises:
            UserCredentialsNotFoundError: Если учётной записи с таким ``user_id`` не существует
            EmailAlreadyVerifiedError: Если email уже подтверждён
            ChallengeNotFoundError: У пользователя нет активного challenge'а для верификации
            VerificationCodeInvalidError: Код не совпал с активным challenge'ом
            ChallengeExpiredError: Срок действия challenge'а истёк
            ChallengeAttemptsExceededError: Превышен лимит попыток
        """
        credentials = await self._uow.user_credentials_repository.find_user_credentials_by_user_id(user_id=user_id)
        if credentials is None:
            raise UserCredentialsNotFoundError()

        credentials.ensure_not_verified()

        challenge = await self._uow.challenge_repository.find_active_challenge_for_update(
            user_id=user_id,
            challenge_type=ChallengeType.EMAIL_VERIFICATION,
        )
        if challenge is None:
            raise ChallengeNotFoundError()

        challenge.ensure_can_attempt(max_attempts=self._email_verification_settings.email_verification_max_attempts)

        if not self._salted_hasher.verify(secret=code, hashed=challenge.code_hash):
            challenge.register_failed_attempt()
            await self._uow.challenge_repository.update_challenge_by_id(challenge=challenge)
            await self._uow.commit()
            raise VerificationCodeInvalidError()

        challenge.mark_used()
        credentials.mark_email_verified()
        await self._uow.challenge_repository.update_challenge_by_id(challenge=challenge)
        await self._uow.user_credentials_repository.update_user_credentials_by_user_id(credentials=credentials)
        await self._uow.commit()
