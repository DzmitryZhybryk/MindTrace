from pydantic import SecretStr

from app.auth.application.schemas import ClientMetadata, IssuedRefreshToken, Registration, TokenPairResult
from app.auth.domain.entities import RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.value_objects import Password
from app.auth.exceptions import EmailAlreadyExistError, UsernameAlreadyExistError
from app.auth.infra.clients.internal_users_client import InternalUsersClient, UserCreate
from app.auth.infra.uow import AuthUnitOfWork
from app.shared.infra.jwt_service import JWTService
from app.shared.infra.password_hasher import PasswordHasher


class AuthService:
    def __init__(
        self,
        uow: AuthUnitOfWork,
        users_client: InternalUsersClient,
        hasher: PasswordHasher,
        jwt_service: JWTService,
        refresh_token_ttl_days: int,
    ) -> None:
        self._uow = uow
        self._users_client = users_client
        self._hasher = hasher
        self._jwt_service = jwt_service
        self._refresh_token_ttl_days = refresh_token_ttl_days

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

        refresh_token = RefreshTokenEntity.create_refresh_token_entity(
            user_id=credentials_entity.user_id,
            ttl_days=self._refresh_token_ttl_days,
            ip_address=client_metadata.ip_address,
            user_agent=client_metadata.user_agent,
        )
        await self._uow.refresh_token_repository.insert_refresh_token(token=refresh_token)
        await self._uow.commit()

        access_token = self._jwt_service.create_access_token(
            user_id=credentials_entity.user_id,
            role=credentials_entity.role.value,
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
