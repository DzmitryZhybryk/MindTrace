from functools import cache
from pathlib import Path

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.enums import AppEnvEnum
from app.utils.file_reader import read_file

_APP_DIR = Path(__file__).resolve().parent
_ROOT_DIR = _APP_DIR.parent


pyproject_data = read_file(_ROOT_DIR / "pyproject.toml")


class WebSettings(BaseModel):
    PORT: int
    HOST: str
    ENVIRONMENT: AppEnvEnum
    RELOAD: bool = False


class Settings(BaseSettings, WebSettings):
    SERVICE_NAME: str = pyproject_data["project"]["name"]
    SERVICE_VERSION: str = pyproject_data["project"]["version"]
    SERVICE_DESCRIPTION: str = pyproject_data["project"]["description"]

    model_config = SettingsConfigDict(frozen=True, env_file=".env")


@cache
def get_app_settings() -> Settings:
    """Get application settings."""
    return Settings()


settings = get_app_settings()
