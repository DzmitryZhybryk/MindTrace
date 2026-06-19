"""
Фикстуры домена geo (unit): сборка ``PlaceService`` на фейке репозитория.

Фейк I/O-границы (``fake_place_repository``) живёт в корневом ``tests/conftest.py`` — он
переиспользуется и api-уровнем. Здесь остаётся только доменно-специфичная проводка
сервиса-под-тестом, чтобы тесты не повторяли её.
"""

import pytest

from app.geo.application.services import PlaceService
from tests.fakes import FakePlaceRepository


@pytest.fixture
def place_service(fake_place_repository: FakePlaceRepository) -> PlaceService:
    return PlaceService(repository=fake_place_repository)
