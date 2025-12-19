import uvicorn

from app.settings import settings


def run_application() -> None:
    """Run FastAPI application with settings from config."""
    uvicorn.run(
        "app.main:create_app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        factory=True,
    )


if __name__ == "__main__":
    run_application()
