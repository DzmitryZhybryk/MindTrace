"""
api-тесты ``HTTPLoggingMiddleware`` на минимальном ASGI-приложении.

Проверяют наблюдаемое поведение: middleware пробрасывает ответ/исключение без изменений
и логирует событие на уровне по классу исхода (2xx→info, 4xx→warning, 5xx→error,
необработанное исключение→error). Доменная ошибка, которую обработчик превратил в ответ,
логируется по самому исключению: серверная категория — с traceback, клиентская — без.
Логи снимаются через ``structlog.testing.capture_logs``, имя события выводится из
``route.name`` (``ok_handler`` → ``"Ok handler"``).
"""

from collections.abc import Callable

from httpx import AsyncClient
from structlog.testing import capture_logs

from app.shared.exceptions import InternalError, TemporaryError
from app.shared.schemas.base import BFastAPI


async def test_success_passes_response_and_logs_info(
    middleware_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """2xx: ответ проходит без изменений, событие логируется на уровне info."""
    with capture_logs() as logs:
        async with make_async_client(middleware_app) as client:
            response = await client.get("/ok")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    matching = [entry for entry in logs if entry.get("event") == "Ok handler"]
    assert len(matching) == 1
    assert matching[0]["log_level"] == "info"
    assert matching[0]["status_code"] == 200


async def test_client_error_response_logs_warning(
    middleware_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """4xx-response: ответ проходит, событие логируется на уровне warning."""
    with capture_logs() as logs:
        async with make_async_client(middleware_app) as client:
            response = await client.get("/client-error")

    assert response.status_code == 400
    matching = [entry for entry in logs if entry.get("event") == "Client error handler"]
    assert len(matching) == 1
    assert matching[0]["log_level"] == "warning"


async def test_server_error_response_logs_error(
    middleware_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """5xx-response: ответ проходит, событие логируется на уровне error."""
    with capture_logs() as logs:
        async with make_async_client(middleware_app) as client:
            response = await client.get("/server-error")

    assert response.status_code == 500
    matching = [entry for entry in logs if entry.get("event") == "Server error handler"]
    assert len(matching) == 1
    assert matching[0]["log_level"] == "error"


async def test_unhandled_exception_is_logged_and_reraised(
    middleware_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """Необработанное исключение логируется на уровне error и пробрасывается (→ 500 наружу)."""
    with capture_logs() as logs:
        async with make_async_client(middleware_app) as client:
            response = await client.get("/unhandled")

    assert response.status_code == 500
    matching = [entry for entry in logs if entry.get("event") == "Unhandled handler"]
    assert len(matching) == 1
    assert matching[0]["log_level"] == "error"
    assert matching[0]["error_type"] == "RuntimeError"


async def test_warning_classified_exception_logs_warning(
    middleware_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """Доменное (клиентское) исключение, дошедшее как exception, логируется на уровне warning."""
    with capture_logs() as logs:
        async with make_async_client(middleware_app) as client:
            response = await client.get("/domain-error")

    # без зарегистрированных хендлеров доменное исключение доходит до ServerErrorMiddleware → 500
    assert response.status_code == 500
    matching = [entry for entry in logs if entry.get("event") == "Domain error handler"]
    assert len(matching) == 1
    assert matching[0]["log_level"] == "warning"


async def test_handled_temporary_error_logs_warning_with_exception(
    handled_errors_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """TEMPORARY, превращённая обработчиком в 503: одна запись warning с исключением, кодом, текстом и details."""
    with capture_logs() as logs:
        async with make_async_client(handled_errors_app) as client:
            response = await client.get("/temporary")

    assert response.status_code == 503
    matching = [entry for entry in logs if entry.get("event") == "Temporary handler"]
    assert len(matching) == 1
    entry = matching[0]
    assert entry["log_level"] == "warning"
    assert entry["status_code"] == 503
    assert entry["error_code"] == "temporary"
    assert entry["error_message"] == "upstream said SlowDown"
    assert entry["error_details"] == {"key": "u1/original.jpg"}
    assert isinstance(entry["exc_info"], TemporaryError)


async def test_handled_internal_error_logs_error_with_exception(
    handled_errors_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """INTERNAL, превращённая обработчиком в 500: запись error с самим исключением, а не только статусом."""
    with capture_logs() as logs:
        async with make_async_client(handled_errors_app) as client:
            response = await client.get("/internal")

    assert response.status_code == 500
    matching = [entry for entry in logs if entry.get("event") == "Internal handler"]
    assert len(matching) == 1
    assert matching[0]["log_level"] == "error"
    assert matching[0]["error_code"] == "internal"
    assert isinstance(matching[0]["exc_info"], InternalError)


async def test_handled_client_error_logs_warning_without_traceback(
    handled_errors_app: BFastAPI,
    make_async_client: Callable[[BFastAPI], AsyncClient],
) -> None:
    """Клиентская доменная ошибка, превращённая обработчиком в 404: warning с кодом, без traceback."""
    with capture_logs() as logs:
        async with make_async_client(handled_errors_app) as client:
            response = await client.get("/not-found")

    assert response.status_code == 404
    matching = [entry for entry in logs if entry.get("event") == "Not found handler"]
    assert len(matching) == 1
    assert matching[0]["log_level"] == "warning"
    assert matching[0]["error_code"] == "not_found"
    assert matching[0].get("exc_info") is None
