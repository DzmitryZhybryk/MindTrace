"""
Generic-проводка **уровня api** (домен-агностично).

Симметрично unit-уровню (``tests/unit/conftest.py`` — cross-доменные unit-фикстуры вроде
``jwt_service``), здесь живёт всё, чьё **определение не знает про конкретный домен**:

- ``api_app`` — ASGI-приложение **без компонентов**: ``create_default_app()`` поднимает
  пустой ``ComponentRegistry`` (нет коннектов к PG/Resend/Procrastinate), плюс
  ``register_exception_handlers`` — чтобы доменные исключения и 422/500 сворачивались в
  тот же ``ErrorResponse``-envelope, что и в проде.
- ``app`` — собранное приложение под тест: монтирует ``router`` под ``router_prefix`` и
  применяет карту ``dependency_overrides``. Механизм один на все домены; сами данные
  (роутер, префикс, override'ы) даёт доменный conftest своими data-фикстурами — поэтому
  второй домен не копирует ``include_router`` + цикл override'ов, а лишь отдаёт три фикстуры.
- ``make_async_client`` — фабрика ``httpx.AsyncClient`` поверх ``ASGITransport`` (без
  реальной сети и без lifespan: ASGITransport его не шлёт, поэтому пустой список
  компонентов даже не стартует). ``raise_app_exceptions=False`` обязателен: Starlette
  после отправки 500-ответа из обработчика ``Exception`` **повторно поднимает** исходное
  исключение для логов — с дефолтным ``True`` оно бы прострелило в тест вместо проверки
  тела 500-ответа.
- ``client`` — httpx-клиент поверх абстрактной фикстуры ``app``: тело домен-агностично,
  конкретный ``app`` (роутер + override'ы) даёт доменный conftest (шаблонная фикстура).
- ``find_set_cookie`` — извлечение «сырого» ``Set-Cookie``-заголовка по имени cookie.
  Атрибуты (HttpOnly/Secure/SameSite/Max-Age) проверяем по этому заголовку, а не по
  httpx-jar: jar не сохраняет ``Secure``-cookie поверх ``http://`` и скрыл бы их атрибуты.

Фейки shared-инфраструктуры (``fake_salted_hasher`` — crypto, ``fake_task_bus`` —
procrastinate, ``deterministic_hasher`` — crypto) и ``mint_access_token`` (shared jwt) тоже
живут здесь: их определения импортируют только ``app.shared.infra``, не зная про домен, и
любой будущий домен переиспользует их как есть. В app они попадают через
``dependency_overrides`` уже в доменном conftest — instance тут, проводка там.
"""

from collections.abc import AsyncIterator, Callable
from typing import Any
from uuid import UUID

import pytest
from fastapi import APIRouter
from httpx import ASGITransport, AsyncClient, Response

from app.main import create_default_app
from app.shared.exceptions import register_exception_handlers
from app.shared.infra.crypto import Sha256DeterministicHasher
from app.shared.infra.jwt import get_jwt_service
from app.shared.schemas.base import BFastAPI
from tests.fakes import FakeSaltedHasher, FakeTaskBus

_BASE_URL = "http://testserver"


@pytest.fixture
def api_app() -> BFastAPI:
    app = create_default_app()
    register_exception_handlers(app)
    return app


@pytest.fixture
def app(
    api_app: BFastAPI,
    router: APIRouter,
    router_prefix: str,
    dependency_overrides: dict[Callable[..., Any], Callable[..., Any]],
) -> BFastAPI:
    """
    Собранное ASGI-приложение под тест.

    Механизм домен-агностичен: смонтировать ``router`` под ``router_prefix`` и применить
    карту ``dependency_overrides``. Сами данные (роутер, префикс, что чем подменять) даёт
    доменный conftest — поэтому второй домен переиспользует эту фикстуру как есть, отдав
    лишь три свои data-фикстуры, а не копируя ``include_router`` + цикл override'ов.
    """
    api_app.include_router(router, prefix=router_prefix)
    api_app.dependency_overrides.update(dependency_overrides)
    return api_app


@pytest.fixture
def make_async_client() -> Callable[[BFastAPI], AsyncClient]:
    def _factory(app: BFastAPI) -> AsyncClient:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        return AsyncClient(transport=transport, base_url=_BASE_URL)

    return _factory


@pytest.fixture
async def client(app: BFastAPI, make_async_client: Callable[[BFastAPI], AsyncClient]) -> AsyncIterator[AsyncClient]:
    """
    httpx-клиент поверх собранного ``app``.

    Тело домен-агностично — клиент лишь оборачивает ``make_async_client``. Конкретный
    ``app`` (с роутером и override'ами) предоставляет доменный conftest: ``client`` зависит
    от абстрактной фикстуры ``app``, которую pytest резолвит вниз по дереву теста
    (шаблонная фикстура). Любой будущий домен, объявив свою ``app``, получает ``client``
    даром.
    """
    async with make_async_client(app) as async_client:
        yield async_client


@pytest.fixture
def find_set_cookie() -> Callable[[Response, str], str | None]:
    def _find(response: Response, name: str) -> str | None:
        for header in response.headers.get_list("set-cookie"):
            if header.startswith(f"{name}="):
                return header

        return None

    return _find


@pytest.fixture
def fake_salted_hasher() -> FakeSaltedHasher:
    return FakeSaltedHasher()


@pytest.fixture
def fake_task_bus() -> FakeTaskBus:
    return FakeTaskBus()


@pytest.fixture
def deterministic_hasher() -> Sha256DeterministicHasher:
    """Реальный sha256-hasher для сидинга ``token_hash`` (тот же, что у боевого token_issuer)."""
    return Sha256DeterministicHasher()


@pytest.fixture
def mint_access_token() -> Callable[..., str]:
    """
    Фабрика валидных access-токенов через реальный ``get_jwt_service()``.

    Токен подписывается тем же секретом из ``settings``, которым приложение его и декодит,
    поэтому Bearer проходит настоящий ``current_user_id_dependency`` без override'а.
    """
    jwt_service = get_jwt_service()

    def _mint(user_id: UUID, *, role: str = "free", email_verified: bool = False) -> str:
        return jwt_service.create_access_token(user_id=user_id, role=role, email_verified=email_verified)

    return _mint
