"""
Фикстуры домена geo (unit): сборка ``PlaceService`` на фейке UoW.

Фейки I/O-границы (``fake_place_repository``, ``fake_geo_uow``) живут в корневом
``tests/conftest.py`` — они переиспользуются и api-уровнем. Здесь остаётся только
доменно-специфичная проводка сервиса-под-тестом, чтобы тесты не повторяли её.
"""

import pytest

from app.geo.application.services.place import PlaceService
from tests.fakes import FakeGeoUnitOfWork


@pytest.fixture
def place_service(fake_geo_uow: FakeGeoUnitOfWork) -> PlaceService:
    return PlaceService(uow=fake_geo_uow)
