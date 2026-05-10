from uuid import UUID

from pydantic import SecretStr

from app.auth.application.schemas import ClientMetadata, IssuedRefreshToken, RegistrationCommand, TokenPairResult
from app.auth.application.settings import AuthServiceSettings
from app.auth.domain.entities import ChallengeEntity, RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.enums import ChallengeType
from app.auth.domain.value_objects import Password
from app.auth.exceptions import (
    ChallengeNotFoundError,
    EmailAlreadyExistError,
    UserCredentialsNotFoundError,
    UsernameAlreadyExistError,
    VerificationCodeInvalidError,
)
from app.auth.infra.clients.internal_users_client import CreateUserRequest, InternalUsersClient
from app.auth.infra.tasks import send_verification_email
from app.auth.infra.uow import AuthUnitOfWork
from app.shared.infra.crypto import SecretHasher
from app.shared.infra.jwt import JWTService
from app.shared.infra.procrastinate import TaskBus


class AuthService:
    def __init__(
        self,
        uow: AuthUnitOfWork,
        users_client: InternalUsersClient,
        hasher: SecretHasher,
        jwt_service: JWTService,
        auth_settings: AuthServiceSettings,
        task_bus: TaskBus,
    ) -> None:
        self._uow = uow
        self._users_client = users_client
        self._hasher = hasher
        self._jwt_service = jwt_service
        self._auth_settings = auth_settings
        self._task_bus = task_bus

    async def register(
        self,
        registration: RegistrationCommand,
        client_metadata: ClientMetadata,
    ) -> TokenPairResult:
        await self._ensure_credentials_unique(email=registration.email, username=registration.username)

        password = Password(hash=self._hasher.hash(registration.password.get_secret_value()))
        credentials_entity = UserCredentialsEntity.create(
            email=registration.email,
            username=registration.username,
            password=password,
        )
        await self._uow.user_credentials_repository.insert_user_credentials(credentials=credentials_entity)
        await self._users_client.create_user(
            request=CreateUserRequest(
                user_id=credentials_entity.user_id,
                username=registration.username,
                email=registration.email,
                marketing_emails_consent=registration.marketing_emails_consent,
                terms_accepted_at=credentials_entity.created_at,
            ),
        )

        refresh_token = RefreshTokenEntity.create_refresh_token_entity(
            user_id=credentials_entity.user_id,
            ttl_days=self._auth_settings.refresh_token_ttl_days,
            ip_address=client_metadata.ip_address,
            user_agent=client_metadata.user_agent,
        )
        await self._uow.refresh_token_repository.insert_refresh_token(token=refresh_token)
        await self._uow.commit()

        await self.request_email_verification(user_id=credentials_entity.user_id)

        access_token = self._jwt_service.create_access_token(
            user_id=credentials_entity.user_id,
            role=credentials_entity.role.value,
            email_verified=credentials_entity.is_email_verified,
        )
        return TokenPairResult(
            access_token=SecretStr(access_token),
            refresh_token=IssuedRefreshToken(
                token_id=refresh_token.token_id,
                expires_at=refresh_token.expires_at,
            ),
        )

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
                cooldown_seconds=self._auth_settings.email_verification_resend_cooldown_seconds,
            )
            existing_challenge.mark_used()
            await self._uow.challenge_repository.update_challenge_by_id(challenge=existing_challenge)

        code = ChallengeEntity.generate_code()
        new_challenge = ChallengeEntity.create(
            user_id=user_id,
            challenge_type=ChallengeType.EMAIL_VERIFICATION,
            code_hash=self._hasher.hash(code),
            ttl_minutes=self._auth_settings.email_verification_ttl_minutes,
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

        challenge.ensure_can_attempt(max_attempts=self._auth_settings.email_verification_max_attempts)

        if not self._hasher.verify(secret=code, hashed=challenge.code_hash):
            challenge.register_failed_attempt()
            await self._uow.challenge_repository.update_challenge_by_id(challenge=challenge)
            await self._uow.commit()
            raise VerificationCodeInvalidError()

        challenge.mark_used()
        credentials.mark_email_verified()
        await self._uow.challenge_repository.update_challenge_by_id(challenge=challenge)
        await self._uow.user_credentials_repository.update_user_credentials_by_user_id(credentials=credentials)
        await self._uow.commit()

    async def _ensure_credentials_unique(self, email: str, username: str) -> None:
        """
        Проверяет уникальность email и username.

        Args:
            email: Email из запроса регистрации.
            username: Username из запроса регистрации.

        Raises:
            EmailAlreadyExistError: Если email уже зарегистрирован.
            UsernameAlreadyExistError: Если username уже занят.
        """
        conflicts = await self._uow.user_credentials_repository.find_user_credentials_by_email_or_username(
            email=email,
            username=username,
        )
        if any(c.email == email for c in conflicts):
            raise EmailAlreadyExistError()

        if any(c.username == username for c in conflicts):
            raise UsernameAlreadyExistError()
