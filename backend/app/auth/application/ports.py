"""
Порты (контракты) исходящих зависимостей auth, которыми пользуется application-слой.

По принципу инверсии зависимостей контракт, на который опираются сервисы,
принадлежит application-слою, а infra его **реализует**: ``infra`` импортирует
порт отсюда, не наоборот. Так не infra диктует application, что тому разрешено
вызывать, а application объявляет свою потребность, под которую инфраструктура
подстраивается.

На эти же порты опираются in-memory фейки в тестах — ``ty`` ловит расхождение
сигнатур между реальной реализацией и фейком. Объявляется ровно тот минимум
методов, которым пользуются сервисы.

Зависит только от ``domain`` (и от ``AsyncSession`` для шва atomic-defer в
``AuthUnitOfWorkPort.session``) — никаких импортов из ``app.*.infra``, поэтому
модуль остаётся листом графа импортов без внутренних циклов.
"""

import datetime as dt
from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.domain.entities import ChallengeEntity, RefreshTokenEntity, UserCredentialsEntity
from app.auth.domain.enums import ChallengeType


class UserCredentialsRepositoryPort(Protocol):
    """Контракт хранилища учётных данных, на который опирается application-слой."""

    async def insert_user_credentials(self, credentials: UserCredentialsEntity) -> None: ...

    async def update_user_credentials_by_user_id(self, credentials: UserCredentialsEntity) -> None: ...

    async def find_user_credentials_by_user_id(self, user_id: UUID) -> UserCredentialsEntity | None: ...

    async def find_user_credentials_by_email_or_username(
        self,
        email: str,
        username: str,
    ) -> list[UserCredentialsEntity]: ...


class RefreshTokenRepositoryPort(Protocol):
    """Контракт хранилища refresh-токенов, на который опирается application-слой."""

    async def insert_refresh_token(self, token: RefreshTokenEntity) -> None: ...

    async def find_by_hash_for_update(self, token_hash: str) -> RefreshTokenEntity | None: ...

    async def update_refresh_token_by_id(self, token: RefreshTokenEntity) -> None: ...

    async def revoke_all_active_by_user_id(self, user_id: UUID) -> None: ...


class ChallengeRepositoryPort(Protocol):
    """Контракт хранилища challenge'ей, на который опирается application-слой."""

    async def insert_challenge(self, challenge: ChallengeEntity) -> None: ...

    async def find_active_challenge_for_update(
        self,
        user_id: UUID,
        challenge_type: ChallengeType,
    ) -> ChallengeEntity | None: ...

    async def update_challenge_by_id(self, challenge: ChallengeEntity) -> None: ...


class AuthUnitOfWorkPort(Protocol):
    """
    Контракт транзакционной границы auth, на который опираются сервисы.

    Объединяет доступ к репозиториям (через их порты), ручной ``commit`` и
    «сырую» сессию для atomic-defer'а procrastinate-таски в текущей транзакции
    (``task_bus.bind_to(uow.session)``). ``session`` типизирована ``AsyncSession``
    осознанно: этот шов уже заложен в ``BaseUnitOfWork`` ради atomic defer и
    инкапсулировать его глубже без передизайна механизма нельзя.
    """

    user_credentials_repository: UserCredentialsRepositoryPort
    refresh_token_repository: RefreshTokenRepositoryPort
    challenge_repository: ChallengeRepositoryPort

    @property
    def session(self) -> AsyncSession: ...

    async def commit(self) -> None: ...


class UsersClientPort(Protocol):
    """
    Контракт исходящего вызова users-сервиса для регистрации пользователя.

    Application объявляет потребность в application-терминах (примитивы), а
    адаптер в infra маппит их в свой wire-контракт (``CreateUserRequest``) —
    wire-DTO остаётся в ``infra/clients`` согласно конвенции проекта.
    """

    async def create_user(
        self,
        *,
        user_id: UUID,
        username: str,
        email: str,
        marketing_emails_consent: bool,
        terms_accepted_at: dt.datetime,
    ) -> None: ...
