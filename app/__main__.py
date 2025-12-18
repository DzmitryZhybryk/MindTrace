import uvicorn
from app.settings import settings
from app.enum import AppEnvEnum


def run_application() -> None:
    """Run FastAPI application with settings from config."""
    uvicorn.run(
        "app.main:create_app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == AppEnvEnum.LOCAL,
        factory=True,
    )


if __name__ == "__main__":
    run_application()
