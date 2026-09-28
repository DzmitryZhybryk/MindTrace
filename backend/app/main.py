from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from typing import Any

from fastapi.routing import APIRoute

from app.auth.infra import auth_blueprint
from app.auth.presentation.routes import auth_router
from app.geo.presentation.routes import geo_router
from app.health.presentation.routes import health_router
from app.journeys.presentation.routes import journey_router
from app.shared.enums import AppEnvEnum
from app.shared.exceptions import register_exception_handlers
from app.shared.infra.di.base import BaseComponent
from app.shared.infra.di.registry import ComponentRegistry
from app.shared.infra.email import ResendComponent
from app.shared.infra.postgres.component import SqlAlchemyComponent
from app.shared.infra.procrastinate import ProcrastinateComponent, TaskBusComponent
from app.shared.logging import HTTPLoggingMiddleware, configure_logging, get_logger
from app.shared.schemas.base import BFastAPI
from app.shared.settings import settings
from app.shared.types import DictStrAny
from app.users.presentation.routes import users_router

logger = get_logger(__name__)


def route_operation_id(route: APIRoute) -> str:
    """
    Возвращает operationId маршрута — имя функции-обработчика.

    Дефолт FastAPI склеивает имя, путь и метод (``login_v1_auth_login__post``), из чего
    кодогенератор фронтового SDK делает нечитаемые имена методов. Уникальность имён
    проверяет ``tests/api/test_openapi_schema.py``.

    Args:
        route: Маршрут FastAPI

    Returns:
        Идентификатор операции для OpenAPI
    """
    return route.name


def create_default_app(
    *,
    components: Sequence[BaseComponent] | None = None,
    **kwargs: Any,
) -> BFastAPI:
    """
    Создает BFastAPI приложение с инициализированным registry и lifecycle events.

    Args:
        components: Список компонентов для регистрации
        **kwargs: Дополнительные аргументы для FastAPI

    Returns:
        BFastAPI приложение с инициализированным registry
    """
    components_list = components or []
    registry = ComponentRegistry()

    @asynccontextmanager
    async def lifespan(_app: BFastAPI) -> AsyncGenerator[None]:
        """Lifecycle events для компонентов."""
        # Startup
        for component in components_list:
            await component.startup(registry)

        # Логируем успешный старт приложения
        logger.info(
            "Application started successfully",
            service_name=_app.title,
            version=_app.version,
        )

        yield
        # Shutdown
        for component in components_list:
            await component.shutdown()

    app = BFastAPI(lifespan=lifespan, **kwargs)
    app.components = components_list
    app.registry = registry

    return app


def create_app() -> BFastAPI:
    """Создает и настраивает FastAPI приложение."""
    configure_logging(include_debug=settings.ENVIRONMENT in (AppEnvEnum.LOCAL, AppEnvEnum.DEVELOPMENT))

    # В production не публикуем интерактивную документацию и OpenAPI-схему наружу:
    # это внутренняя поверхность API, её не должно быть видно на публичном домене.
    docs_kwargs: DictStrAny = {}
    if settings.ENVIRONMENT is AppEnvEnum.PRODUCTION:
        docs_kwargs = {"docs_url": None, "redoc_url": None, "openapi_url": None}

    app = create_default_app(
        title=settings.SERVICE_NAME,
        version=settings.SERVICE_VERSION,
        description=settings.SERVICE_DESCRIPTION,
        generate_unique_id_function=route_operation_id,
        components=[
            SqlAlchemyComponent(settings=settings),
            ResendComponent(settings=settings),
            ProcrastinateComponent(settings=settings, blueprints=[auth_blueprint]),
            TaskBusComponent(),
        ],
        **docs_kwargs,
    )

    # Регистрируем unified middleware для логирования HTTP запросов и исключений
    # Заменяет стандартное логирование uvicorn.access
    app.add_middleware(HTTPLoggingMiddleware)

    register_exception_handlers(app)

    # Операционный эндпоинт вне версионированного контракта (/v1): путь стабилен для
    # docker healthcheck и reverse-proxy независимо от версии API.
    app.include_router(health_router)

    app.include_router(auth_router, prefix="/v1/auth", tags=["auth"])
    app.include_router(geo_router, prefix="/v1/geo", tags=["geo"])
    app.include_router(journey_router, prefix="/v1/journeys", tags=["journeys"])
    app.include_router(users_router, prefix="/v1/users", tags=["users"])

    return app
