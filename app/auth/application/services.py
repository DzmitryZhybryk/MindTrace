import secrets
from typing import Final
from uuid import UUID

from pydantic import SecretStr

from app.auth.application.schemas import (
    ClientMetadata,
    IssuedRefreshToken,
    LoginCommand,
    RegistrationCommand,
    TokenPairResult,
)
from app.auth.application.settings import AuthServiceSettings
from app.auth.domain.entities import ChallengeEntity, RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.enums import ChallengeType
from app.auth.domain.value_objects import Password
from app.auth.exceptions import (
    ChallengeNotFoundError,
    EmailAlreadyExistError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    UserCredentialsNotFoundError,
    UsernameAlreadyExistError,
    VerificationCodeInvalidError,
)
from app.auth.infra.clients.internal_users_client import CreateUserRequest, InternalUsersClient
from app.auth.infra.tasks import send_verification_email
from app.auth.infra.uow import AuthUnitOfWork
from app.shared.infra.crypto import Argon2SecretHasher, DeterministicHasher, SecretHasher
from app.shared.infra.jwt import JWTService
from app.shared.infra.procrastinate import TaskBus

_REFRESH_TOKEN_SECRET_BYTES: Final[int] = 32

# Заранее посчитанный argon2-хеш фиксированной строки. Используется в ``login``
# для timing mitigation: если по логину никого не найдено, мы всё равно делаем
# ``hasher.verify`` против этой константы, чтобы потраченное время не отличалось
# от случая «юзер найден, пароль неверный». Считается один раз при импорте —
# по-запросный argon2 был бы +50ms на каждом login'е.
_DUMMY_PASSWORD_HASH: Final[str] = Argon2SecretHasher().hash(secret="timing_mitigation_dummy")  # noqa: S106


class AuthService:
    def __init__(
        self,
        uow: AuthUnitOfWork,
        users_client: InternalUsersClient,
        hasher: SecretHasher,
        token_hasher: DeterministicHasher,
        jwt_service: JWTService,
        auth_settings: AuthServiceSettings,
        task_bus: TaskBus,
    ) -> None:
        self._uow = uow
        self._users_client = users_client
        self._hasher = hasher
        self._token_hasher = token_hasher
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

        refresh_secret, refresh_token = self._issue_refresh_token(
            user_id=credentials_entity.user_id,
            client_metadata=client_metadata,
        )
        await self._uow.refresh_token_repository.insert_refresh_token(token=refresh_token)
        await self._uow.commit()

        await self.request_email_verification(user_id=credentials_entity.user_id)

        return self._build_token_pair(
            credentials=credentials_entity,
            refresh_secret=refresh_secret,
            refresh_token=refresh_token,
        )

    async def login(self, command: LoginCommand, client_metadata: ClientMetadata) -> TokenPairResult:
        """
        Аутентифицирует пользователя по email/username и паролю.

        Любая ошибка (нет такого пользователя, неверный пароль) превращается
        в один и тот же ``InvalidCredentialsError`` — это не даёт атакующему
        отличить "несуществующий логин" от "неверный пароль" по коду ответа.

        Timing-attack mitigation: если по логину никого не найдено, мы всё
        равно вызываем ``hasher.verify`` против ``_DUMMY_PASSWORD_HASH``. Без
        этого юзер-enumeration был бы тривиален по разнице во времени ответа.

        Args:
            command: Введённые логин и пароль
            client_metadata: IP/user-agent для аудита refresh-токена

        Returns:
            Пара access + refresh для presentation-слоя

        Raises:
            InvalidCredentialsError: Логин не найден или пароль не совпал
        """
        candidates = await self._uow.user_credentials_repository.find_user_credentials_by_email_or_username(
            email=command.login,
            username=command.login,
        )
        credentials = next(
            (c for c in candidates if c.email == command.login or c.username == command.login),
            None,
        )

        if credentials is None:
            self._hasher.verify(secret=command.password.get_secret_value(), hashed=_DUMMY_PASSWORD_HASH)
            raise InvalidCredentialsError()

        if not self._hasher.verify(secret=command.password.get_secret_value(), hashed=credentials.password.hash):
            raise InvalidCredentialsError()

        refresh_secret, refresh_token = self._issue_refresh_token(
            user_id=credentials.user_id,
            client_metadata=client_metadata,
        )
        await self._uow.refresh_token_repository.insert_refresh_token(token=refresh_token)
        await self._uow.commit()

        return self._build_token_pair(
            credentials=credentials,
            refresh_secret=refresh_secret,
            refresh_token=refresh_token,
        )

    async def logout(self, refresh_secret: str | None) -> None:
        """
        Отзывает текущий refresh-токен по секрету из cookie.

        Идемпотентная операция: отсутствие cookie / неизвестный секрет /
        уже revoked-токен — все три случая завершаются молча, без ошибки.
        Это позволяет фронту звать /logout без предварительной проверки
        состояния и без боязни race с другим табом.

        Args:
            refresh_secret: Plaintext-секрет из cookie или ``None``, если cookie не пришла
        """
        if refresh_secret is None:
            return

        token_hash = self._token_hasher.digest(secret=refresh_secret)
        token = await self._uow.refresh_token_repository.find_by_hash_for_update(token_hash=token_hash)
        if token is None or token.is_revoked:
            return

        token.revoke()
        await self._uow.refresh_token_repository.update_refresh_token_by_id(token=token)
        await self._uow.commit()

    async def refresh(self, refresh_secret: str, client_metadata: ClientMetadata) -> TokenPairResult:
        """
        Ротация refresh-токена с reuse detection (OAuth 2.1).

        Поток:
          1. По hash'у секрета берём строку под ``FOR UPDATE`` — параллельные
             /refresh с одним секретом сериализуются.
          2. Если токен уже revoked — это reuse: либо двойной /refresh, либо
             утечка cookie. Защитная реакция — отозвать все активные refresh-токены
             пользователя и вернуть 401, чтобы вынудить полный re-login.
          3. Если истёк — 401 без побочных эффектов.
          4. Подгружаем credentials по ``user_id`` (нужно для нового access-token'а).
             Если их нет — race с удалением аккаунта, 401.
          5. Старый токен помечаем revoked, выпускаем новый, всё одной транзакцией.

        Args:
            refresh_secret: Plaintext-секрет из cookie
            client_metadata: IP/user-agent для аудита нового refresh-токена

        Returns:
            Новая пара access + refresh

        Raises:
            InvalidRefreshTokenError: Секрет не найден / уже revoked / истёк / связанный аккаунт не существует
        """
        token_hash = self._token_hasher.digest(secret=refresh_secret)
        token = await self._uow.refresh_token_repository.find_by_hash_for_update(token_hash=token_hash)
        if token is None:
            raise InvalidRefreshTokenError()

        if token.is_revoked:
            await self._uow.refresh_token_repository.revoke_all_active_by_user_id(user_id=token.user_id)
            await self._uow.commit()
            raise InvalidRefreshTokenError()

        if token.is_expired:
            raise InvalidRefreshTokenError()

        credentials = await self._uow.user_credentials_repository.find_user_credentials_by_user_id(
            user_id=token.user_id,
        )
        if credentials is None:
            raise InvalidRefreshTokenError()

        token.revoke()
        await self._uow.refresh_token_repository.update_refresh_token_by_id(token=token)

        new_refresh_secret, new_refresh_token = self._issue_refresh_token(
            user_id=token.user_id,
            client_metadata=client_metadata,
        )
        await self._uow.refresh_token_repository.insert_refresh_token(token=new_refresh_token)
        await self._uow.commit()

        return self._build_token_pair(
            credentials=credentials,
            refresh_secret=new_refresh_secret,
            refresh_token=new_refresh_token,
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

    def _issue_refresh_token(
        self,
        user_id: UUID,
        client_metadata: ClientMetadata,
    ) -> tuple[str, RefreshTokenEntity]:
        """
        Генерирует plaintext-секрет и доменную сущность refresh-токена.

        Plaintext уходит в HttpOnly cookie, в БД лежит только его
        детерминированный hash — компрометация дампа БД не даёт rerun'нуть
        существующие сессии без знания самого секрета.

        Args:
            user_id: ID пользователя, которому выдаём токен
            client_metadata: IP/user-agent для аудита

        Returns:
            Кортеж ``(plaintext-секрет, RefreshTokenEntity готовый к insert'у)``
        """
        plaintext = secrets.token_urlsafe(_REFRESH_TOKEN_SECRET_BYTES)
        token = RefreshTokenEntity.create_refresh_token_entity(
            user_id=user_id,
            token_hash=self._token_hasher.digest(secret=plaintext),
            ttl_days=self._auth_settings.refresh_token_ttl_days,
            ip_address=client_metadata.ip_address,
            user_agent=client_metadata.user_agent,
        )
        return plaintext, token

    def _build_token_pair(
        self,
        credentials: UserCredentialsEntity,
        refresh_secret: str,
        refresh_token: RefreshTokenEntity,
    ) -> TokenPairResult:
        """
        Собирает ``TokenPairResult`` из credentials и пары plaintext/entity.

        Args:
            credentials: Доменная сущность учётных данных (нужна для role + email_verified в JWT)
            refresh_secret: Plaintext-секрет refresh-токена
            refresh_token: Доменная сущность refresh-токена (источник ``expires_at``)

        Returns:
            Готовый к отдаче через presentation-слой результат
        """
        access_token = self._jwt_service.create_access_token(
            user_id=credentials.user_id,
            role=credentials.role.value,
            email_verified=credentials.is_email_verified,
        )
        return TokenPairResult(
            access_token=SecretStr(access_token),
            refresh_token=IssuedRefreshToken(
                secret=SecretStr(refresh_secret),
                expires_at=refresh_token.expires_at,
            ),
        )

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
