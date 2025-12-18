from fastapi.responses import ORJSONResponse
from app.routes.v1 import message_router
from app.schemas import BFastAPI


def create_app() -> BFastAPI:
    """Create and configure FastAPI application."""
    app = BFastAPI(
        title="MindTrace",
        version="0.1.0",
        default_response_class=ORJSONResponse,
    )
    
    app.include_router(message_router, prefix="/v1/messages")
    
    return app
