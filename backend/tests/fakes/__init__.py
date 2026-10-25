"""
Переиспользуемые in-memory фейки, модуль на владельца порта: домен (``auth``, ``geo``,
``journeys``, ``users``) или shared-вертикаль (``crypto``, ``di``, ``email``, ``procrastinate``).
"""

from tests.fakes.auth import (
    FakeAuthUnitOfWork,
    FakeChallengeRepository,
    FakeEmailVerificationService,
    FakeRefreshTokenRepository,
    FakeUserCredentialsRepository,
    FakeUsersClient,
)
from tests.fakes.crypto import FakeSaltedHasher
from tests.fakes.di import FakeComponent
from tests.fakes.email import FakeEmailTransport
from tests.fakes.geo import FakeGeoUnitOfWork, FakePlaceRepository
from tests.fakes.journeys import FakeJourneyRepository, FakeJourneyUnitOfWork, FakePlacesClient, MovementConnectionQuery
from tests.fakes.procrastinate import DeferredTask, FakeSessionBoundTaskBus, FakeTaskBus
from tests.fakes.users import FakeUserRepository, FakeUserUnitOfWork

__all__ = [
    "DeferredTask",
    "FakeAuthUnitOfWork",
    "FakeChallengeRepository",
    "FakeComponent",
    "FakeEmailTransport",
    "FakeEmailVerificationService",
    "FakeGeoUnitOfWork",
    "FakeJourneyRepository",
    "FakeJourneyUnitOfWork",
    "FakePlaceRepository",
    "FakePlacesClient",
    "FakeRefreshTokenRepository",
    "FakeSaltedHasher",
    "FakeSessionBoundTaskBus",
    "FakeTaskBus",
    "FakeUserCredentialsRepository",
    "FakeUserRepository",
    "FakeUserUnitOfWork",
    "FakeUsersClient",
    "MovementConnectionQuery",
]
