from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.ports import UserCredentialsRepositoryPort
from app.auth.domain.entities import UserCredentialsEntity
from app.auth.domain.enums import UserRole
from app.auth.domain.value_objects import Password
from app.auth.infra.models import UserCredentials
from app.shared.repositories.base_repository import BaseDBRepository
from app.shared.types import DictStrAny


class UserCredentialsRepository(BaseDBRepository[UserCredentials], UserCredentialsRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        """
        Инициализирует репозиторий учётных данных пользователей.

        Args:
            session: Асинхронная SQLAlchemy-сессия, привязанная к UnitOfWork
        """
        super().__init__(session=session, model=UserCredentials)

    async def insert_user_credentials(self, credentials: UserCredentialsEntity) -> None:
        """
        Добавляет учётные данные пользователя в сессию без коммита.

        Запись становится видимой другим транзакциям только после ``commit()``
        в UnitOfWork. Уникальные индексы по ``email`` и ``username`` могут
        выбросить ``IntegrityError`` на flush, если конфликт не был отловлен
        предварительной проверкой.

        Args:
            credentials: Доменная сущность учётных данных
        """
        await self.insert(data=self._to_model(entity=credentials))

    async def update_user_credentials_by_user_id(self, credentials: UserCredentialsEntity) -> None:
        """
        Персистит изменённое состояние учётных данных через atomic UPDATE по PK.

        Все non-PK-поля переписываются текущим состоянием entity.

        Args:
            credentials: Доменная сущность с уже обновлённым состоянием
        """
        query = (
            sa.update(UserCredentials)
            .where(UserCredentials.user_id == credentials.user_id)
            .values(**self._to_update_values(entity=credentials))
        )
        await self._session.execute(query)

    async def find_user_credentials_by_user_id(self, user_id: UUID) -> UserCredentialsEntity | None:
        """
        Загружает учётные данные пользователя по его PK.

        Args:
            user_id: UUID пользователя

        Returns:
            Доменная сущность учётных данных либо ``None``, если запись не найдена
        """
        query = sa.select(UserCredentials).where(UserCredentials.user_id == user_id)
        model = await self._fetch_one(query=query)
        return self._to_entity(model=model) if model else None

    async def find_user_credentials_by_email_or_username(
        self,
        email: str,
        username: str,
    ) -> list[UserCredentialsEntity]:
        """
        Загружает все записи, у которых совпадает email или username.

        Используется при регистрации, чтобы одним запросом обнаружить конфликт
        по обоим полям. PostgreSQL планирует это как ``BitmapOr`` из двух
        independent index scan'ов по уникальным индексам ``email`` и
        ``username``, поэтому возвращается максимум 2 строки.

        Args:
            email: Email из запроса регистрации
            username: Username из запроса регистрации

        Returns:
            Список найденных доменных сущностей (0..2 элементов)
        """
        query = sa.select(UserCredentials).where(
            (UserCredentials.email == email) | (UserCredentials.username == username),
        )
        result = await self._session.execute(query)
        models = result.scalars().all()
        return [self._to_entity(model=model) for model in models]

    def _to_model(self, entity: UserCredentialsEntity) -> UserCredentials:
        """
        Конвертирует доменную сущность учётных данных в ORM-модель.

        Args:
            entity: Доменная сущность учётных данных

        Returns:
            ORM-модель, готовая к добавлению в сессию
        """
        return UserCredentials(
            user_id=entity.user_id,
            email=entity.email,
            username=entity.username,
            password_hash=entity.password.hash,
            role=entity.role.value,
            email_verified_at=entity.email_verified_at,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
        )

    def _to_update_values(self, entity: UserCredentialsEntity) -> DictStrAny:
        """
        Собирает dict non-PK-полей для UPDATE-выражения.

        Симметрично с ``_to_model``/``_to_entity``: маппинг полей собран в одном
        месте, чтобы при добавлении нового поля на entity не забыть прокинуть
        его в UPDATE.

        Args:
            entity: Доменная сущность учётных данных

        Returns:
            Словарь ``column -> value`` без PK ``user_id``
        """
        return {
            "email": entity.email,
            "username": entity.username,
            "password_hash": entity.password.hash,
            "role": entity.role.value,
            "email_verified_at": entity.email_verified_at,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
            "deleted_at": entity.deleted_at,
        }

    def _to_entity(self, model: UserCredentials) -> UserCredentialsEntity:
        """
        Конвертирует ORM-модель в доменную сущность учётных данных.

        Args:
            model: ORM-модель из БД

        Returns:
            Доменная сущность учётных данных
        """
        return UserCredentialsEntity(
            user_id=model.user_id,
            email=model.email,
            username=model.username,
            password=Password(hash=model.password_hash),
            role=UserRole(model.role),
            email_verified_at=model.email_verified_at,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
        )
