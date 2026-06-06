import datetime as dt
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.ports import RefreshTokenRepositoryPort
from app.auth.domain.entities import RefreshTokenEntity
from app.auth.infra.models import RefreshToken
from app.shared.repositories.base_repository import BaseDBRepository
from app.shared.types import DictStrAny


class RefreshTokenRepository(BaseDBRepository[RefreshToken], RefreshTokenRepositoryPort):
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

    async def find_by_hash_for_update(self, token_hash: str) -> RefreshTokenEntity | None:
        """
        Находит refresh-токен по hash'у и блокирует строку до конца транзакции.

        ``SELECT ... FOR UPDATE`` нужен для refresh-флоу: гарантирует, что
        параллельные запросы /refresh с одним и тем же secret сериализуются
        и второй увидит уже revoked-состояние, что триггерит reuse detection.

        Args:
            token_hash: Детерминированный hash plaintext-секрета из cookie

        Returns:
            Доменная сущность refresh-токена либо ``None``, если запись не найдена
        """
        query = sa.select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        model = await self._fetch_one(query=query)
        return self._to_entity(model=model) if model else None

    async def update_refresh_token_by_id(self, token: RefreshTokenEntity) -> None:
        """
        Персистит изменённое состояние refresh-токена через atomic UPDATE по PK.

        Все non-PK-поля переписываются текущим состоянием entity. Под ранее взятым
        ``FOR UPDATE``-локом параллельные апдейты сериализованы.

        Args:
            token: Доменная сущность с уже обновлённым состоянием
        """
        query = (
            sa.update(RefreshToken)
            .where(RefreshToken.id == token.token_id)
            .values(**self._to_update_values(entity=token))
        )
        await self._session.execute(query)

    async def revoke_all_active_by_user_id(self, user_id: UUID) -> None:
        """
        Bulk-revoke всех активных refresh-токенов пользователя.

        Используется для reuse detection (OAuth 2.1): если на /refresh пришёл
        уже revoked-секрет — это сигнал компрометации, и все остальные
        активные сессии пользователя инвалидируются.

        Args:
            user_id: ID пользователя, чьи активные токены отзываем
        """
        now = dt.datetime.now(tz=dt.UTC)
        query = (
            sa.update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now, updated_at=now)
        )
        await self._session.execute(query)

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
            token_hash=entity.token_hash,
            expires_at=entity.expires_at,
            revoked_at=entity.revoked_at,
            ip_address=entity.ip_address,
            user_agent=entity.user_agent,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
        )

    def _to_update_values(self, entity: RefreshTokenEntity) -> DictStrAny:
        """
        Собирает dict non-PK-полей для UPDATE-выражения.

        Симметрично с ``_to_model``/``_to_entity``: маппинг полей собран в одном
        месте, чтобы при добавлении нового поля на entity не забыть прокинуть
        его в UPDATE.

        Args:
            entity: Доменная сущность refresh-токена

        Returns:
            Словарь ``column -> value`` без PK ``id``
        """
        return {
            "user_id": entity.user_id,
            "token_hash": entity.token_hash,
            "expires_at": entity.expires_at,
            "revoked_at": entity.revoked_at,
            "ip_address": entity.ip_address,
            "user_agent": entity.user_agent,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
            "deleted_at": entity.deleted_at,
        }

    def _to_entity(self, model: RefreshToken) -> RefreshTokenEntity:
        """
        Конвертирует ORM-модель в доменную сущность.

        Args:
            model: ORM-модель из БД

        Returns:
            Доменная сущность refresh-токена
        """
        return RefreshTokenEntity(
            token_id=model.id,
            user_id=model.user_id,
            token_hash=model.token_hash,
            expires_at=model.expires_at,
            revoked_at=model.revoked_at,
            ip_address=model.ip_address,
            user_agent=model.user_agent,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
        )
