from fastapi.responses import ORJSONResponse

from app.routes.v1 import message_router
from app.schemas import BFastAPI
from app.settings import settings


def create_app() -> BFastAPI:
    """Create and configure FastAPI application."""
    app = BFastAPI(
        title=settings.SERVICE_NAME,
        version=settings.SERVICE_VERSION,
        description=settings.SERVICE_DESCRIPTION,
        default_response_class=ORJSONResponse,
    )

    app.include_router(message_router, prefix="/v1/messages")

    return app
