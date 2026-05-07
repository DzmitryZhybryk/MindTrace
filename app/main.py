from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from typing import Any

from app.auth import auth_router

# Настраиваем логирование в самом начале, до всех остальных импортов
# Это гарантирует, что handlers создаются с правильным форматтером
from app.shared.enums import AppEnvEnum
from app.shared.exceptions import register_exception_handlers
from app.shared.infra.components.base import BaseComponent
from app.shared.infra.components.postgres import SqlAlchemyComponent
from app.shared.infra.components.registry import ComponentRegistry
from app.shared.middlewares import HTTPLoggingMiddleware
from app.shared.schemas.base import BFastAPI
from app.shared.settings import settings
from app.shared.utils.logger import configure_logging, get_logger
from app.users import router as user_router

logger = get_logger(__name__)


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
    app = create_default_app(
        title=settings.SERVICE_NAME,
        version=settings.SERVICE_VERSION,
        description=settings.SERVICE_DESCRIPTION,
        components=[SqlAlchemyComponent(settings=settings)],
    )

    # Регистрируем unified middleware для логирования HTTP запросов и исключений
    # Заменяет стандартное логирование uvicorn.access
    app.add_middleware(HTTPLoggingMiddleware)

    register_exception_handlers(app)

    app.include_router(auth_router, prefix="/v1/auth", tags=["v1.auth"])
    app.include_router(user_router, prefix="/v1/users", tags=["v1.users"])

    return app
