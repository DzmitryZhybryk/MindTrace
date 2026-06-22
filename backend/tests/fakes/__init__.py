"""Переиспользуемые in-memory фейки: репозитории, UoW, клиенты, hasher'ы, task bus, сервисы."""

from tests.fakes.clients import CreatedUserCall, FakeUsersClient
from tests.fakes.email import FakeEmailTransport
from tests.fakes.geo import FakePlaceRepository
from tests.fakes.hashers import FakeSaltedHasher
from tests.fakes.journeys import FakeJourneyRepository, FakeJourneyUnitOfWork
from tests.fakes.repositories import (
    FakeChallengeRepository,
    FakeRefreshTokenRepository,
    FakeUserCredentialsRepository,
)
from tests.fakes.services import FakeEmailVerificationService
from tests.fakes.task_bus import DeferredTask, FakeSessionBoundTaskBus, FakeTaskBus
from tests.fakes.uow import FakeAuthUnitOfWork
from tests.fakes.users import FakeUserRepository, FakeUserUnitOfWork

__all__ = [
    "CreatedUserCall",
    "DeferredTask",
    "FakeAuthUnitOfWork",
    "FakeChallengeRepository",
    "FakeEmailTransport",
    "FakeEmailVerificationService",
    "FakeJourneyRepository",
    "FakeJourneyUnitOfWork",
    "FakePlaceRepository",
    "FakeRefreshTokenRepository",
    "FakeSaltedHasher",
    "FakeSessionBoundTaskBus",
    "FakeTaskBus",
    "FakeUserCredentialsRepository",
    "FakeUserRepository",
    "FakeUserUnitOfWork",
    "FakeUsersClient",
]
