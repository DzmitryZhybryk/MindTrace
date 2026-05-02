from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.domain.entities import RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.enums import UserRole
from app.auth.domain.value_objects import Password
from app.auth.infra.models import RefreshToken, UserCredentials
from app.shared.repositories.base_repository import BaseDBRepository


class CredentialsRepository(BaseDBRepository[UserCredentials]):
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
        query = select(UserCredentials).where(
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
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
        )

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
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
        )


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
