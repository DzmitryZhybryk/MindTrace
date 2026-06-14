"""
Фикстуры logging-тестов.

``restore_logging`` снимает и восстанавливает глобальное состояние stdlib-logging и
structlog (``configure_logging`` мутирует root-logger и structlog-дефолты — без
restore это протекло бы в другие тесты). ``routed_app`` — минимальное FastAPI-приложение
с именованным роутом для тестов ``get_event_name``.
"""

from collections.abc import Callable, Iterator
from typing import Any

import pytest
import structlog
from fastapi import FastAPI
from starlette.requests import Request


@pytest.fixture
def restore_logging() -> Iterator[None]:
    """Снимок root-logger (handlers + level) и structlog-дефолтов с восстановлением после теста."""
    import logging

    root_logger = logging.getLogger()
    saved_handlers = root_logger.handlers[:]
    saved_level = root_logger.level
    yield
    root_logger.handlers[:] = saved_handlers
    root_logger.setLevel(saved_level)
    structlog.reset_defaults()


@pytest.fixture
def make_request() -> Callable[..., Request]:
    """
    Фабрика ``starlette.Request`` из минимального scope для logging-тестов.

    Параметры опциональны: ``app`` (для ``get_event_name`` — нужен ``request.app.routes``),
    ``client``/``query``/``state`` (для ``extract_request_context``), ``path``/``method``.
    """

    def _make(
        *,
        app: FastAPI | None = None,
        path: str = "/v1/ping",
        method: str = "GET",
        client: tuple[str, int] | None = None,
        query: bytes = b"",
        state: dict[str, Any] | None = None,
    ) -> Request:
        scope: dict[str, Any] = {
            "type": "http",
            "method": method,
            "path": path,
            "raw_path": path.encode(),
            "query_string": query,
            "headers": [],
            "state": state or {},
        }
        if app is not None:
            scope["app"] = app

        if client is not None:
            scope["client"] = client

        return Request(scope)

    return _make


@pytest.fixture
def routed_app() -> FastAPI:
    """FastAPI с одним именованным GET-роутом ``/v1/ping`` (имя — ``ping_handler``)."""
    app = FastAPI()

    @app.get("/v1/ping", name="ping_handler")
    async def _ping() -> dict[str, str]:
        return {}

    return app
