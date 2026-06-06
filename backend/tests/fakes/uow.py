"""Фейк ``AuthUnitOfWorkPort``: держит фейк-репозитории, мокнутый commit и sentinel-сессию."""

from typing import cast
from unittest.mock import AsyncMock

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.application.ports import (
    AuthUnitOfWorkPort,
    ChallengeRepositoryPort,
    RefreshTokenRepositoryPort,
    UserCredentialsRepositoryPort,
)


class FakeAuthUnitOfWork(AuthUnitOfWorkPort):
    """
    In-memory UoW.

    Репозитории передаются снаружи (фикстуры держат те же инстансы, чтобы тест
    мог проверять их состояние), ``commit`` — ``AsyncMock`` (``commit_mock``) для
    проверки факта фиксации, ``session`` — sentinel: фейк-bus её не использует, но
    тест сверяет, что atomic-defer сделан именно в этой сессии.
    """

    def __init__(
        self,
        *,
        user_credentials_repository: UserCredentialsRepositoryPort,
        refresh_token_repository: RefreshTokenRepositoryPort,
        challenge_repository: ChallengeRepositoryPort,
    ) -> None:
        self.user_credentials_repository = user_credentials_repository
        self.refresh_token_repository = refresh_token_repository
        self.challenge_repository = challenge_repository
        self.commit_mock = AsyncMock()
        self._session = cast(AsyncSession, object())

    @property
    def session(self) -> AsyncSession:
        return self._session

    async def commit(self) -> None:
        await self.commit_mock()
