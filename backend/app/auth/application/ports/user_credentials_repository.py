from typing import Protocol
from uuid import UUID

from app.auth.domain.entities import UserCredentialsEntity

__all__ = ["UserCredentialsRepositoryPort"]


class UserCredentialsRepositoryPort(Protocol):
    """Контракт хранилища учётных данных, на который опирается application-слой."""

    async def insert_user_credentials(self, user_credentials_entity: UserCredentialsEntity) -> None: ...

    async def update_user_credentials_by_user_id(self, user_credentials_entity: UserCredentialsEntity) -> None: ...

    async def find_user_credentials_by_user_id(self, user_id: UUID) -> UserCredentialsEntity | None: ...

    async def find_user_credentials_by_email(self, email: str) -> UserCredentialsEntity | None: ...

    async def find_user_credentials_by_username(self, username: str) -> UserCredentialsEntity | None: ...

    async def find_user_credentials_by_login(self, login: str) -> UserCredentialsEntity | None: ...
