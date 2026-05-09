from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.domain.entities import RefreshTokenEntity
from app.auth.infra.models import RefreshToken
from app.shared.repositories.base_repository import BaseDBRepository


class RefreshTokenRepository(BaseDBRepository[RefreshToken]):
    def __init__(self, session: AsyncSession) -> None:
        """
        Инициализирует репозиторий refresh-токенов.

        Args:
            session: Асинхронная SQLAlchemy-сессия, привязанная к UnitOfWork
        """
        super().__init__(session=session, model=RefreshToken)

    async def insert_refresh_token(self, token: RefreshTokenEntity) -> None:
        """
        Добавляет refresh-токен в сессию без коммита.

        Запись становится видимой другим транзакциям только после ``commit()``
        в UnitOfWork.

        Args:
            token: Доменная сущность refresh-токена
        """
        await self.insert(data=self._to_model(entity=token))

    def _to_model(self, entity: RefreshTokenEntity) -> RefreshToken:
        """
        Конвертирует доменную сущность refresh-токена в ORM-модель.

        Args:
            entity: Доменная сущность refresh-токена

        Returns:
            ORM-модель, готовая к добавлению в сессию
        """
        return RefreshToken(
            id=entity.token_id,
            user_id=entity.user_id,
            expires_at=entity.expires_at,
            last_seen_at=entity.last_seen_at,
            revoked_at=entity.revoked_at,
            ip_address=entity.ip_address,
            user_agent=entity.user_agent,
        )
