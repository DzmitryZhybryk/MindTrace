"""
Geo-данные для generic api-проводки (``tests/api/conftest.py``).

Три data-фикстуры, которыми generic-фикстура ``app`` собирает приложение: ``router``
(geo-роутер), ``router_prefix`` (``/v1/geo``) и ``dependency_overrides``. Подменяем только
**листовую** dependency — репозиторий мест; реальными остаются ``place_service`` и
``current_user_id_dependency`` (Bearer проходит настоящий декод реальным settings-секретом
через ``mint_access_token``). Сам механизм сборки ``app``/``client`` и ``mint_access_token``
живут в родительском ``tests/api/conftest.py``, фейк репозитория — в корневом ``tests/conftest.py``.
"""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi import APIRouter

from app.geo.presentation.dependencies import place_repository_dependency
from app.geo.presentation.routes import geo_router
from tests.fakes import FakePlaceRepository

_GEO_ROUTER_PREFIX = "/v1/geo"


@pytest.fixture
def router() -> APIRouter:
    return geo_router


@pytest.fixture
def router_prefix() -> str:
    return _GEO_ROUTER_PREFIX


@pytest.fixture
def dependency_overrides(
    fake_place_repository: FakePlaceRepository,
) -> dict[Callable[..., Any], Callable[..., Any]]:
    return {place_repository_dependency: lambda: fake_place_repository}
