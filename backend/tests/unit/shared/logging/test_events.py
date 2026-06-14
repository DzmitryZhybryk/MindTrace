"""
Unit-тесты ``get_event_name`` — вывода имени события из совпавшего роута.

Совпавший роут даёт гуманизированное имя из ``route.name``; если ни один роут не
совпал (например, 404) — фоллбэк ``"{method} {path}"``. shared-логирование не хранит
маппинг доменных путей — имя принадлежит домену, объявившему роут.
"""

from collections.abc import Callable

from fastapi import FastAPI
from starlette.requests import Request

from app.shared.logging.events import get_event_name


def test_get_event_name_humanizes_matched_route_name(
    routed_app: FastAPI,
    make_request: Callable[..., Request],
) -> None:
    """Совпавший роут ``ping_handler`` → гуманизированное ``"Ping handler"``."""
    request = make_request(app=routed_app, path="/v1/ping", method="GET")

    assert get_event_name(request) == "Ping handler"


def test_get_event_name_falls_back_when_no_route_matches(
    routed_app: FastAPI,
    make_request: Callable[..., Request],
) -> None:
    """Несовпавший путь (нет роута) → фоллбэк ``"{method} {path}"``."""
    request = make_request(app=routed_app, path="/v1/unknown", method="GET")

    assert get_event_name(request) == "GET /v1/unknown"
