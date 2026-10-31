"""
api-тесты единого контракта ошибок (через auth-роуты).

Пиннят форму ``ErrorResponse``-envelope, общую для всех ошибок: доменные несут
``{code, message, details, timestamp}``; field-bound кладут ``details.field``; 422 от
FastAPI заворачивается в ``code="validation_error"`` с ``details.fields[]``; не-доменное
исключение даёт ``{code: "internal"}`` без утечки внутренних деталей; доменная ошибка
серверной категории (503, 500) отдаёт код и сообщение класса, без ``details`` и текста инстанса.

Категории, недостижимые auth-роутами (403 PERMISSION_DENIED, доменный 422 UNPROCESSABLE),
покрыты юнит-тестом ``resolve_http_status`` (``tests/unit/shared/exceptions/test_mappings.py``).
"""

import datetime as dt

import pytest
from httpx import AsyncClient

from app.shared.exceptions import BaseDomainError, InternalError, UnavailableError
from app.shared.types import DictStrAny
from tests.fakes import FakeAuthUnitOfWork


async def test_domain_error_envelope_has_all_fields(client: AsyncClient) -> None:
    """Доменная ошибка отдаёт полный envelope {code, message, details, timestamp}."""
    response = await client.post("/v1/auth/login/", json={"login": "ghost@example.com", "password": "whatever123"})

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "auth.invalid_credentials"
    assert body["message"]
    assert "details" in body
    assert dt.datetime.fromisoformat(body["timestamp"])


async def test_field_bound_error_carries_details_field(client: AsyncClient) -> None:
    """Field-bound доменная ошибка несёт details.field с именем поля формы."""
    response = await client.post(
        "/v1/auth/register/",
        json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "password123",
            "terms_accepted": False,
            "marketing_emails_consent": False,
        },
    )

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "auth.terms_not_accepted"
    assert body["details"] == {"field": "terms_accepted"}


async def test_validation_error_envelope_lists_fields(client: AsyncClient) -> None:
    """422 от FastAPI сворачивается в code=validation_error с details.fields[] (field + reason)."""
    response = await client.post("/v1/auth/register/", json={})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    fields = body["details"]["fields"]
    assert isinstance(fields, list)
    assert fields
    for field_error in fields:
        assert isinstance(field_error["field"], str)
        assert isinstance(field_error["reason"], str)


async def test_non_domain_exception_returns_internal_without_leak(
    client: AsyncClient,
    fake_uow: FakeAuthUnitOfWork,
) -> None:
    """Не-доменное исключение → 500 {code: internal} без утечки сообщения/трейсбека."""
    fake_uow.commit_mock.side_effect = RuntimeError("secret internal boom")

    response = await client.post(
        "/v1/auth/register/",
        json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "password123",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
    )

    assert response.status_code == 500
    assert response.json() == {"code": "internal", "message": "Внутренняя ошибка сервера"}
    assert "boom" not in response.text
    assert "RuntimeError" not in response.text
    assert "Traceback" not in response.text


@pytest.mark.parametrize(
    ("error", "expected_status", "expected_body"),
    [
        pytest.param(
            UnavailableError(message="upstream said SlowDown", details={"key": "u1/original.jpg"}),
            503,
            {"code": "unavailable", "message": "Сервис временно недоступен"},
            id="unavailable",
        ),
        pytest.param(
            InternalError(message="pool exhausted at 10.0.0.5", details={"dsn": "postgres://db"}),
            500,
            {"code": "internal", "message": "Внутренняя ошибка сервера"},
            id="internal",
        ),
    ],
)
async def test_server_side_domain_error_hides_details_and_instance_message(
    client: AsyncClient,
    fake_uow: FakeAuthUnitOfWork,
    error: BaseDomainError,
    expected_status: int,
    expected_body: DictStrAny,
) -> None:
    """Серверная доменная ошибка: статус по категории, код и сообщение класса; details и текст инстанса скрыты."""
    fake_uow.commit_mock.side_effect = error

    response = await client.post(
        "/v1/auth/register/",
        json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "password123",
            "terms_accepted": True,
            "marketing_emails_consent": False,
        },
    )

    assert response.status_code == expected_status
    body = response.json()
    assert {"code": body["code"], "message": body["message"]} == expected_body
    assert body["details"] is None
    assert error.message not in response.text
