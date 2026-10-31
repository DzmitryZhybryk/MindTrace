"""
Фикстуры api-тестов shared-инфры.

``middleware_app`` — минимальное ASGI-приложение с навешенным ``HTTPLoggingMiddleware``
и роутами под каждый класс исхода (2xx / 4xx-response / 5xx-response / необработанное
исключение). ``handled_errors_app`` — то же плюс обработчики исключений: доменная ошибка
доходит до middleware готовым ответом, как в боевом приложении. Имена роутов заданы явно —
middleware выводит из них имя события.
"""

import pytest
from fastapi.responses import JSONResponse

from app.shared.exceptions import InternalError, NotFoundError, TemporaryError
from app.shared.exceptions.handlers import register_exception_handlers
from app.shared.logging.middleware import HTTPLoggingMiddleware
from app.shared.schemas.base import BFastAPI


@pytest.fixture
def middleware_app() -> BFastAPI:
    """ASGI-приложение с ``HTTPLoggingMiddleware`` и роутами на каждый класс статуса/исключение."""
    app = BFastAPI()
    app.add_middleware(HTTPLoggingMiddleware)

    @app.get("/ok", name="ok_handler")
    async def _ok() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/client-error", name="client_error_handler")
    async def _client_error() -> JSONResponse:
        return JSONResponse({"error": "bad request"}, status_code=400)

    @app.get("/server-error", name="server_error_handler")
    async def _server_error() -> JSONResponse:
        return JSONResponse({"error": "boom"}, status_code=500)

    @app.get("/unhandled", name="unhandled_handler")
    async def _unhandled() -> JSONResponse:
        raise RuntimeError("unhandled failure")  # noqa: TRY003 — намеренный сбой роута для except-ветки

    # Без register_exception_handlers доменное исключение НЕ конвертируется в Response, а доходит
    # до middleware как исключение — это покрывает WARNING-ветку except (доменная ошибка = клиентская).
    @app.get("/domain-error", name="domain_error_handler")
    async def _domain_error() -> JSONResponse:
        raise NotFoundError

    return app


@pytest.fixture
def handled_errors_app() -> BFastAPI:
    """ASGI-приложение с ``HTTPLoggingMiddleware`` и обработчиками исключений; роут на каждую категорию."""
    app = BFastAPI()
    app.add_middleware(HTTPLoggingMiddleware)
    register_exception_handlers(app)

    @app.get("/temporary", name="temporary_handler")
    async def _temporary() -> JSONResponse:
        raise TemporaryError(message="upstream said SlowDown", details={"key": "u1/original.jpg"})

    @app.get("/internal", name="internal_handler")
    async def _internal() -> JSONResponse:
        raise InternalError

    @app.get("/not-found", name="not_found_handler")
    async def _not_found() -> JSONResponse:
        raise NotFoundError

    return app
