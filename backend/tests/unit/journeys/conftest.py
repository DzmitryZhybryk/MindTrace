"""
Фикстуры домена journeys (unit): сборка ``JourneyService`` на фейке UoW.

Фейки I/O-границы (``fake_journey_uow``/``fake_journey_repository``) живут в корневом
``tests/conftest.py`` — переиспользуются и api-уровнем. Здесь остаётся только доменная
проводка сервиса-под-тестом.
"""

import pytest

from app.journeys.application.services import JourneyService
from tests.fakes import FakeJourneyUnitOfWork, FakePlacesClient


@pytest.fixture
def journey_service(fake_journey_uow: FakeJourneyUnitOfWork, fake_places_client: FakePlacesClient) -> JourneyService:
    return JourneyService(uow=fake_journey_uow, places_client=fake_places_client)
