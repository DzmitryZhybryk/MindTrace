from typing import Final

from app.auth.application.email_verification_service import EmailVerificationService
from app.auth.application.ports import AuthUnitOfWorkPort, UsersClientPort
from app.auth.application.schemas import (
    ClientMetadata,
    LoginCommand,
    RegistrationCommand,
    TokenPairResult,
)
from app.auth.application.token_issuer import TokenIssuer
from app.auth.domain.entities import UserCredentialsEntity
from app.auth.domain.value_objects import Password
from app.auth.exceptions import (
    EmailAlreadyExistError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    UsernameAlreadyExistError,
)
from app.shared.infra.crypto import SaltedHasherPort, get_argon2_salted_hasher

# Заранее посчитанный argon2-хеш фиксированной строки. Используется в ``login``
# для timing mitigation: если по логину никого не найдено, мы всё равно делаем
# ``salted_hasher.verify`` против этой константы, чтобы потраченное время не отличалось
# от случая «юзер найден, пароль неверный». Считается один раз при импорте —
# по-запросный argon2 был бы +50ms на каждом login'е.
_DUMMY_PASSWORD_HASH: Final[str] = get_argon2_salted_hasher().hash(secret="timing_mitigation_dummy")  # noqa: S106


class AuthService:
    def __init__(
        self,
        uow: AuthUnitOfWorkPort,
        users_client: UsersClientPort,
        salted_hasher: SaltedHasherPort,
        token_issuer: TokenIssuer,
        email_verification_service: EmailVerificationService,
    ) -> None:
        self._uow = uow
        self._users_client = users_client
        self._salted_hasher = salted_hasher
        self._token_issuer = token_issuer
        self._email_verification_service = email_verification_service

    async def register(
        self,
        registration: RegistrationCommand,
        client_metadata: ClientMetadata,
    ) -> TokenPairResult:
        async with self._uow.transaction():
            await self._ensure_credentials_unique(email=registration.email, username=registration.username)

            password = Password(hash=self._salted_hasher.hash(registration.password.get_secret_value()))
            credentials_entity = UserCredentialsEntity.create(
                email=registration.email,
                username=registration.username,
                password=password,
            )
            await self._uow.user_credentials_repository.insert_user_credentials(credentials=credentials_entity)
            # Материализуем родителя до зависимого refresh_token: INSERT user_credentials
            # должен уйти в БД раньше INSERT refresh_tokens (FK refresh_tokens.user_id →
            # user_credentials.user_id). Порядок INSERT'ов между мапперами в одном flush на
            # commit'е не гарантирован, поэтому фиксируем его явным flush'ем здесь.
            await self._uow.flush()
            await self._users_client.create_user(
                user_id=credentials_entity.user_id,
                username=registration.username,
                email=registration.email,
                marketing_emails_consent=registration.marketing_emails_consent,
                terms_accepted_at=credentials_entity.created_at,
            )

            refresh_secret, refresh_token = self._token_issuer.issue_refresh_token(
                user_id=credentials_entity.user_id,
                client_metadata=client_metadata,
            )
            await self._uow.refresh_token_repository.insert_refresh_token(token=refresh_token)
            await self._uow.commit()

        # Вне транзакции register'а: own transaction()/commit (atomic-defer письма) — поэтому ПОСЛЕ блока.
        await self._email_verification_service.request_email_verification(user_id=credentials_entity.user_id)

        return self._token_issuer.build_token_pair(
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
        равно вызываем ``salted_hasher.verify`` против ``_DUMMY_PASSWORD_HASH``. Без
        этого юзер-enumeration был бы тривиален по разнице во времени ответа.

        Args:
            command: Введённые логин и пароль
            client_metadata: IP/user-agent для аудита refresh-токена

        Returns:
            Пара access + refresh для presentation-слоя

        Raises:
            InvalidCredentialsError: Логин не найден или пароль не совпал
        """
        async with self._uow.transaction():
            candidates = await self._uow.user_credentials_repository.find_user_credentials_by_email_or_username(
                email=command.login,
                username=command.login,
            )
            credentials = next(
                (c for c in candidates if c.email == command.login or c.username == command.login),
                None,
            )

            if credentials is None:
                self._salted_hasher.verify(secret=command.password.get_secret_value(), hashed=_DUMMY_PASSWORD_HASH)
                raise InvalidCredentialsError()

            if not self._salted_hasher.verify(
                secret=command.password.get_secret_value(),
                hashed=credentials.password.hash,
            ):
                raise InvalidCredentialsError()

            refresh_secret, refresh_token = self._token_issuer.issue_refresh_token(
                user_id=credentials.user_id,
                client_metadata=client_metadata,
            )
            await self._uow.refresh_token_repository.insert_refresh_token(token=refresh_token)
            await self._uow.commit()

        return self._token_issuer.build_token_pair(
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

        async with self._uow.transaction():
            token_hash = self._token_issuer.hash_refresh_secret(refresh_secret=refresh_secret)
            token = await self._uow.refresh_token_repository.find_refresh_token_by_hash_for_update(
                token_hash=token_hash,
            )
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
        async with self._uow.transaction():
            token_hash = self._token_issuer.hash_refresh_secret(refresh_secret=refresh_secret)
            token = await self._uow.refresh_token_repository.find_refresh_token_by_hash_for_update(
                token_hash=token_hash,
            )
            if token is None:
                raise InvalidRefreshTokenError()

            if token.is_revoked:
                await self._uow.refresh_token_repository.revoke_all_active_refresh_tokens_by_user_id(
                    user_id=token.user_id,
                )
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

            new_refresh_secret, new_refresh_token = self._token_issuer.issue_refresh_token(
                user_id=token.user_id,
                client_metadata=client_metadata,
            )
            await self._uow.refresh_token_repository.insert_refresh_token(token=new_refresh_token)
            await self._uow.commit()

        return self._token_issuer.build_token_pair(
            credentials=credentials,
            refresh_secret=new_refresh_secret,
            refresh_token=new_refresh_token,
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
