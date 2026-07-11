"""
Фикстура-фабрика ``BaseHTTPClient`` для unit-тестов HTTP-клиента.

Создаёт клиентов на общий тест-``base_url`` и гарантированно закрывает каждый
(``aclose``) в teardown — раньше это делали вручную лишь 2 из ~11 тестов, остальные
текли. Тест зовёт ``make_http_client()`` после ``install_mock_transport(handler)``.
"""

from collections.abc import AsyncIterator, Callable

import pytest

from app.shared.infra.http.client import BaseHTTPClient
from app.shared.infra.http.config import HTTPClientConfig

_BASE_URL = "https://api.example.test"


@pytest.fixture
async def make_http_client() -> AsyncIterator[Callable[[], BaseHTTPClient]]:
    """
    Возвращает ``make()`` — фабрику ``BaseHTTPClient`` на тест-``base_url``.

    Каждый созданный клиент регистрируется и закрывается (``aclose``) в teardown,
    поэтому тесту не нужно звать ``aclose`` вручную.

    Returns:
        Callable без аргументов, возвращающий свежий ``BaseHTTPClient``
    """
    clients: list[BaseHTTPClient] = []

    def _make() -> BaseHTTPClient:
        client = BaseHTTPClient(config=HTTPClientConfig(base_url=_BASE_URL))
        clients.append(client)
        return client

    yield _make

    for client in clients:
        await client.aclose()
