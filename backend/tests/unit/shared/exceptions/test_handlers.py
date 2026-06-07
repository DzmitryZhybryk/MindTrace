"""
Юнит-тесты страховочных веток exception-handler'ов.

Боевой путь (доменное исключение → свой handler → envelope; не-доменное → 500) покрыт
api-тестами. Здесь — две защитные ветки, до которых через приложение не дойти: handler
вызван напрямую с «не тем» типом исключения.
"""

import json

from starlette.requests import Request

from app.shared.exceptions.base import NotFoundError
from app.shared.exceptions.handlers import domain_exception_handler, global_exception_handler

# Handler'ы игнорируют request — достаточно минимального scope.
_REQUEST = Request({"type": "http"})


def test_domain_handler_with_non_domain_exception_returns_internal() -> None:
    """domain_exception_handler с не-доменным исключением → 500 {code: internal} (страховка)."""
    response = domain_exception_handler(_REQUEST, ValueError("boom"))

    assert response.status_code == 500
    assert json.loads(bytes(response.body)) == {"code": "internal", "message": "Внутренняя ошибка сервера"}


def test_global_handler_delegates_domain_exception_to_envelope() -> None:
    """global_exception_handler с доменным исключением делегирует доменному handler'у (статус по категории)."""
    response = global_exception_handler(_REQUEST, NotFoundError())

    assert response.status_code == 404
    assert json.loads(bytes(response.body))["code"] == "not_found"
