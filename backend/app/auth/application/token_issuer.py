import secrets
from typing import Final
from uuid import UUID

from pydantic import SecretStr

from app.auth.application.schemas import ClientMetadata, IssuedRefreshToken, TokenPairResult
from app.auth.domain.entities import RefreshTokenEntity, UserCredentialsEntity
from app.shared.infra.crypto import DeterministicHasherPort
from app.shared.infra.jwt import JWTService

_REFRESH_TOKEN_SECRET_BYTES: Final[int] = 32


class TokenIssuer:
    """
    Выпускает access/refresh-токены и собирает финальную пару для presentation-слоя.

    Инкапсулирует три детали выпуска, которые AuthService использовать должен,
    но знать про их устройство — нет: генерацию случайного refresh-секрета,
    его детерминированный hash для хранения в БД и подпись JWT access-токена.
    """

    def __init__(
        self,
        deterministic_hasher: DeterministicHasherPort,
        jwt_service: JWTService,
        refresh_token_ttl_days: int,
    ) -> None:
        self._deterministic_hasher = deterministic_hasher
        self._jwt_service = jwt_service
        self._refresh_token_ttl_days = refresh_token_ttl_days

    def hash_refresh_secret(self, refresh_secret: str) -> str:
        """
        Возвращает детерминированный hash plaintext-секрета для поиска в БД.

        Используется в ``logout``/``refresh``, когда из cookie приходит
        plaintext, а в БД лежит только hash — нужно посчитать тот же hash,
        чтобы найти соответствующий ``RefreshTokenEntity``.

        Args:
            refresh_secret: Plaintext-секрет из cookie

        Returns:
            Hex-строка hash'а, по которой ищется запись в refresh_tokens
        """
        return self._deterministic_hasher.digest(secret=refresh_secret)

    def issue_refresh_token(
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
            token_hash=self._deterministic_hasher.digest(secret=plaintext),
            ttl_days=self._refresh_token_ttl_days,
            ip_address=client_metadata.ip_address,
            user_agent=client_metadata.user_agent,
        )
        return plaintext, token

    def build_token_pair(
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
