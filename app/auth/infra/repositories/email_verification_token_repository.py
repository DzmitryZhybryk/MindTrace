from uuid import UUID

from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.domain.entities import EmailVerificationTokenEntity
from app.auth.infra.models import EmailVerificationToken
from app.shared.repositories.base_repository import BaseDBRepository
from app.shared.types import DictStrAny


class EmailVerificationTokenRepository(BaseDBRepository[EmailVerificationToken]):
    def __init__(self, session: AsyncSession) -> None:
        """
        Инициализирует репозиторий токенов подтверждения email.

        Args:
            session: Асинхронная SQLAlchemy-сессия, привязанная к UnitOfWork
        """
        super().__init__(session=session, model=EmailVerificationToken)

    async def insert_token(self, token: EmailVerificationTokenEntity) -> None:
        """
        Добавляет токен подтверждения в сессию без коммита.

        Запись становится видимой другим транзакциям только после ``commit()``
        в UnitOfWork. Партиальный unique-индекс гарантирует, что в один момент
        у пользователя может быть не более одного активного (`used_at IS NULL`)
        токена — конфликт всплывёт ``IntegrityError`` на flush.

        Args:
            token: Доменная сущность токена подтверждения
        """
        await self.insert(data=self._to_model(entity=token))

    async def find_active_token_by_user_id(self, user_id: UUID) -> EmailVerificationTokenEntity | None:
        """
        Находит активный (неиспользованный) токен пользователя без блокировки.

        Read-only-вариант: подходит для информационных запросов. Для verify-флоу
        используй ``find_active_by_user_id_for_update`` — там нужна сериализация
        параллельных попыток.

        Args:
            user_id: ID пользователя

        Returns:
            Доменная сущность токена либо ``None``, если активного токена нет
        """
        query = select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.used_at.is_(None),
        )
        model = await self._fetch_one(query=query)
        return self._to_entity(model=model) if model else None

    async def find_active_token_by_user_id_for_update(
        self,
        user_id: UUID,
    ) -> EmailVerificationTokenEntity | None:
        """
        Находит активный токен пользователя и блокирует строку до конца транзакции.

        ``SELECT ... FOR UPDATE`` нужен для verify-флоу: гарантирует, что
        параллельные запросы на ввод кода сериализуются и не дают потерять
        increment счётчика попыток (read-modify-write race под READ COMMITTED).

        Args:
            user_id: ID пользователя

        Returns:
            Доменная сущность токена либо ``None``, если активного токена нет
        """
        query = (
            select(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == user_id,
                EmailVerificationToken.used_at.is_(None),
            )
            .with_for_update()
        )
        model = await self._fetch_one(query=query)
        return self._to_entity(model=model) if model else None

    async def update_token_by_id(self, token: EmailVerificationTokenEntity) -> None:
        """
        Персистит изменённое состояние токена через atomic UPDATE по PK.

        Все non-PK-поля переписываются текущим состоянием entity. Под ранее взятым
        ``FOR UPDATE``-локом параллельные апдейты сериализованы.

        Args:
            token: Доменная сущность с уже обновлённым состоянием
        """
        query = (
            sa_update(EmailVerificationToken)
            .where(EmailVerificationToken.id == token.token_id)
            .values(**self._to_update_values(entity=token))
        )
        await self._session.execute(query)

    def _to_model(self, entity: EmailVerificationTokenEntity) -> EmailVerificationToken:
        """
        Конвертирует доменную сущность в ORM-модель.

        Args:
            entity: Доменная сущность токена подтверждения

        Returns:
            ORM-модель, готовая к добавлению в сессию
        """
        return EmailVerificationToken(
            id=entity.token_id,
            user_id=entity.user_id,
            code_hash=entity.code_hash,
            expires_at=entity.expires_at,
            attempts=entity.attempts,
            used_at=entity.used_at,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
        )

    def _to_update_values(self, entity: EmailVerificationTokenEntity) -> DictStrAny:
        """
        Собирает dict non-PK-полей для UPDATE-выражения.

        Симметрично с ``_to_model``/``_to_entity``: маппинг полей собран в одном
        месте, чтобы при добавлении нового поля на entity не забыть прокинуть
        его в UPDATE.

        Args:
            entity: Доменная сущность токена

        Returns:
            Словарь ``column -> value`` без PK ``id``
        """
        return {
            "user_id": entity.user_id,
            "code_hash": entity.code_hash,
            "expires_at": entity.expires_at,
            "attempts": entity.attempts,
            "used_at": entity.used_at,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
            "deleted_at": entity.deleted_at,
        }

    def _to_entity(self, model: EmailVerificationToken) -> EmailVerificationTokenEntity:
        """
        Конвертирует ORM-модель в доменную сущность.

        Args:
            model: ORM-модель из БД

        Returns:
            Доменная сущность токена подтверждения
        """
        return EmailVerificationTokenEntity(
            token_id=model.id,
            user_id=model.user_id,
            code_hash=model.code_hash,
            expires_at=model.expires_at,
            attempts=model.attempts,
            used_at=model.used_at,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
        )
