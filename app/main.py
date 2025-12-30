from fastapi.responses import ORJSONResponse

from app.enums import AppEnvEnum
from app.infra.components.postgres import SqlAlchemyComponent
from app.routes.v1 import message_router
from app.schemas import BFastAPI
from app.settings import settings
from app.utils.logger import configure_logging


def create_app() -> BFastAPI:
    """Create and configure FastAPI application."""
    # Инициализация логирования
    is_debug = settings.ENVIRONMENT in (AppEnvEnum.LOCAL, AppEnvEnum.DEVELOPMENT)
    configure_logging(is_debug=is_debug)

    app = BFastAPI(
        title=settings.SERVICE_NAME,
        version=settings.SERVICE_VERSION,
        description=settings.SERVICE_DESCRIPTION,
        components=[SqlAlchemyComponent(settings=settings)],
        default_response_class=ORJSONResponse,
    )

    app.include_router(message_router, prefix="/v1/messages")

    return app
