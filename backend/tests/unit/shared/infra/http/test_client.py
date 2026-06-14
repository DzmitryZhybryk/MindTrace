"""
Unit-тесты ``BaseHTTPClient`` через ``httpx.MockTransport`` (без сети).

Покрывают маппинг ответов внешнего API в ``ExternalAPI*Error``: успех проходит,
таймаут/сетевая/5xx-апстрим → temporary (кандидат на retry), 4xx/500/429 →
persistent, плюс извлечение сообщения об ошибке из тела.
"""

from collections.abc import Callable

import httpx
import pytest

from app.shared.infra.http.client import BaseHTTPClient
from app.shared.infra.http.config import HTTPClientConfig
from app.shared.infra.http.exceptions import ExternalAPIPersistentError, ExternalAPITemporaryError

_BASE_URL = "https://api.example.test"

type _InstallTransport = Callable[[Callable[[httpx.Request], httpx.Response]], None]


def _client() -> BaseHTTPClient:
    return BaseHTTPClient(config=HTTPClientConfig(base_url=_BASE_URL))


async def test_get_success_returns_response(install_mock_transport: _InstallTransport) -> None:
    """Успешный GET (2xx) возвращает httpx-ответ без обёртки в исключение."""
    install_mock_transport(lambda request: httpx.Response(200, json={"ok": True}))
    client = _client()

    response = await client.get("/ping")

    assert response.status_code == 200
    await client.aclose()


async def test_post_success_returns_response(install_mock_transport: _InstallTransport) -> None:
    """Успешный POST (2xx) возвращает httpx-ответ."""
    install_mock_transport(lambda request: httpx.Response(201, json={"id": "1"}))
    client = _client()

    response = await client.post("/items", json={"name": "x"})

    assert response.status_code == 201


async def test_timeout_raises_temporary_error(install_mock_transport: _InstallTransport) -> None:
    """Таймаут запроса → ``ExternalAPITemporaryError`` (кандидат на retry)."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)  # noqa: TRY003 — сообщение библиотечного исключения

    install_mock_transport(handler)
    client = _client()

    with pytest.raises(ExternalAPITemporaryError):
        await client.get("/ping")


async def test_network_error_raises_temporary_error(install_mock_transport: _InstallTransport) -> None:
    """Сетевая ошибка → ``ExternalAPITemporaryError`` (кандидат на retry)."""

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)  # noqa: TRY003 — сообщение библиотечного исключения

    install_mock_transport(handler)
    client = _client()

    with pytest.raises(ExternalAPITemporaryError):
        await client.get("/ping")


async def test_upstream_503_raises_temporary_error(install_mock_transport: _InstallTransport) -> None:
    """503 (апстрим/гейтвей) → ``ExternalAPITemporaryError``."""
    install_mock_transport(lambda request: httpx.Response(503))
    client = _client()

    with pytest.raises(ExternalAPITemporaryError):
        await client.get("/ping")


async def test_server_500_raises_persistent_error(install_mock_transport: _InstallTransport) -> None:
    """500 сознательно НЕ временный → ``ExternalAPIPersistentError`` (без retry)."""
    install_mock_transport(lambda request: httpx.Response(500))
    client = _client()

    with pytest.raises(ExternalAPIPersistentError):
        await client.get("/ping")


async def test_rate_limited_429_raises_persistent_error(install_mock_transport: _InstallTransport) -> None:
    """429 сознательно НЕ временный (нужен backoff) → ``ExternalAPIPersistentError``."""
    install_mock_transport(lambda request: httpx.Response(429))
    client = _client()

    with pytest.raises(ExternalAPIPersistentError):
        await client.get("/ping")


async def test_client_error_extracts_message_from_body(install_mock_transport: _InstallTransport) -> None:
    """4xx с телом ``{"message": ...}`` → persistent с этим сообщением и статусом."""
    install_mock_transport(lambda request: httpx.Response(404, json={"message": "ресурс не найден"}))
    client = _client()

    with pytest.raises(ExternalAPIPersistentError) as exc_info:
        await client.get("/missing")

    assert exc_info.value.status == 404
    assert exc_info.value.message == "ресурс не найден"


async def test_client_error_without_known_keys_falls_back_to_status(
    install_mock_transport: _InstallTransport,
) -> None:
    """4xx с телом-словарём без ключей message/detail/error → сообщение-фоллбэк ``HTTP <status>``."""
    install_mock_transport(lambda request: httpx.Response(400, json={"foo": "bar"}))
    client = _client()

    with pytest.raises(ExternalAPIPersistentError) as exc_info:
        await client.get("/bad")

    assert exc_info.value.message == "HTTP 400"
    assert exc_info.value.body == {"foo": "bar"}


async def test_client_error_with_non_json_body_keeps_text(install_mock_transport: _InstallTransport) -> None:
    """4xx с не-JSON телом → тело сохраняется как текст, сообщение-фоллбэк ``HTTP <status>``."""
    install_mock_transport(lambda request: httpx.Response(400, text="upstream said no"))
    client = _client()

    with pytest.raises(ExternalAPIPersistentError) as exc_info:
        await client.get("/bad")

    assert exc_info.value.message == "HTTP 400"
    assert exc_info.value.body == "upstream said no"


async def test_client_error_with_empty_body_has_none_body(install_mock_transport: _InstallTransport) -> None:
    """4xx с пустым телом → ``body is None`` (пустой текст не превращается в строку)."""
    install_mock_transport(lambda request: httpx.Response(400))
    client = _client()

    with pytest.raises(ExternalAPIPersistentError) as exc_info:
        await client.get("/bad")

    assert exc_info.value.body is None
