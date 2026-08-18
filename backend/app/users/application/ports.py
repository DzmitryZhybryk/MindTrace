"""
Порты (контракты) исходящих зависимостей users, которыми пользуется application-слой.

По принципу инверсии зависимостей контракт, на который опирается ``UserService``,
принадлежит application-слою, а infra его **реализует**: ``infra`` импортирует
порт отсюда, не наоборот. На эти же порты опираются in-memory фейки в тестах —
``ty`` ловит расхождение сигнатур между реальной реализацией и фейком.

Объявляется ровно тот минимум методов, которым пользуется сервис. Зависит только
от ``domain`` — никаких импортов из ``app.*.infra``, поэтому модуль остаётся листом
графа импортов без внутренних циклов.
"""

from contextlib import AbstractAsyncContextManager
from typing import Protocol
from uuid import UUID

from app.users.domain.entities import UserEntity


class UserRepositoryPort(Protocol):
    """Контракт хранилища пользователей, на который опирается application-слой."""

    async def insert_user(self, user_entity: UserEntity) -> None: ...

    async def find_user_by_id(self, user_id: UUID) -> UserEntity | None: ...


class UserUnitOfWorkPort(Protocol):
    """
    Контракт транзакционной границы users, на который опирается ``UserService``.

    Объединяет доступ к репозиторию (через его порт), транзакционную область
    ``transaction()`` и явный ``commit``. В отличие от ``AuthUnitOfWorkPort`` здесь
    нет ``session``-шва: users-флоу не делает atomic-defer procrastinate-таски,
    поэтому raw-сессия в контракте не нужна (YAGNI).
    """

    user_repository: UserRepositoryPort

    def transaction(self) -> AbstractAsyncContextManager[None]: ...

    async def commit(self) -> None: ...
