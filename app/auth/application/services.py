import datetime as dt
from typing import Protocol
from uuid import UUID

from pydantic import SecretStr

from app.auth.application.schemas import ClientMetadata, IssuedRefreshToken, Login, Registration, TokenPairResult
from app.auth.domain.entities import RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.value_objects import Password
from app.auth.exceptions import (
    EmailAlreadyExistError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    UsernameAlreadyExistError,
)
from app.auth.infra.clients.internal_users_client import InternalUsersClient, UserCreate
from app.auth.infra.uow import AuthUnitOfWork
from app.shared.infra.jwt_service import JWTService
from app.shared.infra.password_hasher import PasswordHasher


class AuthServiceConfig(Protocol):
    """
    Контракт конфигурации, нужной ``AuthService``.

    Объявляет минимальный набор настроек, которыми оперирует сервис. Любой
    объект с такими атрибутами удовлетворяет протоколу по duck-typing — в
    проде инъектится адаптер над ``Settings`` (см. presentation/dependencies),
    в тестах — произвольный dataclass или ``SimpleNamespace``. Это полностью
    отвязывает application-слой от формы и происхождения глобального конфига.
    """

    refresh_token_ttl_days: int


class AuthService:
    def __init__(
        self,
        uow: AuthUnitOfWork,
        users_client: InternalUsersClient,
        hasher: PasswordHasher,
        jwt_service: JWTService,
        config: AuthServiceConfig,
    ) -> None:
        self._uow = uow
        self._users_client = users_client
        self._hasher = hasher
        self._jwt_service = jwt_service
        self._config = config

    async def register(
        self,
        registration: Registration,
        client_metadata: ClientMetadata,
    ) -> TokenPairResult:
        await self._ensure_credentials_unique(email=registration.email, username=registration.username)

        password = Password(hash=self._hasher.hash(registration.password.get_secret_value()))
        credentials_entity = UserCredentialsEntity.create(
            email=registration.email,
            username=registration.username,
            password=password,
        )
        await self._uow.credentials_repository.insert_user_credentials(credentials=credentials_entity)
        await self._users_client.create_user(
            user=UserCreate(
                user_id=credentials_entity.user_id,
                username=registration.username,
                email=registration.email,
                marketing_emails_consent=registration.marketing_emails_consent,
                terms_accepted_at=credentials_entity.created_at,
            ),
        )

        return await self._issue_token_pair(credentials=credentials_entity, client_metadata=client_metadata)

    async def login(
        self,
        credentials: Login,
        client_metadata: ClientMetadata,
    ) -> TokenPairResult:
        """
        Аутентифицирует пользователя по паре ``login`` (email или username) и пароль.

        ``login`` интерпретируется как универсальный идентификатор: пользователь
        может ввести либо email, либо username. Репозиторий возвращает всех
        кандидатов, у которых либо email, либо username совпадает с переданной
        строкой; пароль проверяется по каждому, чтобы корректно отработать
        теоретический случай, когда email одного пользователя совпадает с
        username другого. При неудаче и для несуществующего логина, и для
        неверного пароля выдаётся одинаковое сообщение — это исключает
        user enumeration через текст ошибки.

        Args:
            credentials: Логин-идентификатор и пароль из запроса
            client_metadata: IP и User-Agent клиента, привязываются к refresh-токену

        Returns:
            Пара access/refresh токенов

        Raises:
            InvalidCredentialsError: Логин не найден либо пароль не подошёл
        """
        candidates = await self._uow.credentials_repository.find_user_credentials_by_email_or_username(
            email=credentials.login,
            username=credentials.login,
        )
        password = credentials.password.get_secret_value()
        matched = next(
            (c for c in candidates if self._hasher.verify(password=password, hashed=c.password.hash)),
            None,
        )
        if matched is None:
            raise InvalidCredentialsError()

        return await self._issue_token_pair(credentials=matched, client_metadata=client_metadata)

    async def logout(self, refresh_token_id: UUID) -> None:
        """
        Отзывает refresh-токен пользователя.

        Идемпотентен: повторный вызов на уже отозванном или несуществующем
        токене не выбрасывает ошибку и не меняет момент отзыва. Это намеренно —
        endpoint не должен раскрывать факт существования конкретного
        ``token_id``, а с точки зрения клиента «отозванный» и «никогда не
        существовавший» токен эквивалентны.

        Args:
            refresh_token_id: Идентификатор refresh-токена из cookie
        """
        await self._uow.refresh_token_repository.revoke_refresh_token(
            token_id=refresh_token_id,
            revoked_at=dt.datetime.now(tz=dt.UTC),
        )
        await self._uow.commit()

    async def refresh(
        self,
        refresh_token_id: UUID,
        client_metadata: ClientMetadata,
    ) -> TokenPairResult:
        """
        Выпускает новую пару токенов в обмен на действующий refresh-токен.

        Реализует token rotation: текущий refresh-токен отзывается, выпускается
        новый — с новым ``token_id`` и новым ``expires_at``. Это значит, что
        утёкший токен можно использовать максимум один раз: при следующем
        ``/refresh/`` он окажется уже отозванным и легитимный пользователь
        получит ``InvalidRefreshTokenError``.

        Роль для access-токена берётся актуальная из ``user_credentials`` —
        изменения роли применяются со следующего refresh.

        Args:
            refresh_token_id: Идентификатор refresh-токена из cookie
            client_metadata: IP и User-Agent клиента, привязываются к новому refresh-токену

        Returns:
            Новая пара access/refresh токенов

        Raises:
            InvalidRefreshTokenError: Токен не найден, отозван, истёк, или
                его владелец отсутствует в ``user_credentials``
        """
        token = await self._uow.refresh_token_repository.find_refresh_token_by_id(token_id=refresh_token_id)
        if token is None or not token.is_active(now=dt.datetime.now(tz=dt.UTC)):
            raise InvalidRefreshTokenError()

        credentials = await self._uow.credentials_repository.find_user_credentials_by_user_id(user_id=token.user_id)
        if credentials is None:
            raise InvalidRefreshTokenError()

        await self._uow.refresh_token_repository.revoke_refresh_token(
            token_id=token.token_id,
            revoked_at=dt.datetime.now(tz=dt.UTC),
        )
        return await self._issue_token_pair(credentials=credentials, client_metadata=client_metadata)

    async def _issue_token_pair(
        self,
        credentials: UserCredentialsEntity,
        client_metadata: ClientMetadata,
    ) -> TokenPairResult:
        """
        Выпускает пару access/refresh токенов и финализирует UoW.

        Создаёт refresh-сущность, добавляет её в репозиторий, коммитит UoW
        (вместе со всем, что было сделано вызывающим методом — например,
        вставкой credentials при регистрации) и выпускает access-JWT. Метод
        ничего не знает о происхождении ``credentials`` — это общая хвостовая
        часть как для регистрации, так и для логина.

        Args:
            credentials: Учётные данные пользователя, для которого выпускаются токены
            client_metadata: IP и User-Agent клиента, привязываются к refresh-токену

        Returns:
            Пара access/refresh токенов
        """
        refresh_token = RefreshTokenEntity.create_refresh_token_entity(
            user_id=credentials.user_id,
            ttl_days=self._config.refresh_token_ttl_days,
            ip_address=client_metadata.ip_address,
            user_agent=client_metadata.user_agent,
        )
        await self._uow.refresh_token_repository.insert_refresh_token(token=refresh_token)
        await self._uow.commit()

        access_token = self._jwt_service.create_access_token(
            user_id=credentials.user_id,
            role=credentials.role.value,
        )
        return TokenPairResult(
            access_token=SecretStr(access_token),
            refresh_token=IssuedRefreshToken(
                token_id=refresh_token.token_id,
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
        conflicts = await self._uow.credentials_repository.find_user_credentials_by_email_or_username(
            email=email,
            username=username,
        )
        if any(c.email == email for c in conflicts):
            raise EmailAlreadyExistError()

        if any(c.username == username for c in conflicts):
            raise UsernameAlreadyExistError()
