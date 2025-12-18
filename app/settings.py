from pathlib import Path
from typing import Any
from functools import cache
from pydantic import BaseModel
from app.enum import AppEnvEnum
from pydantic_settings import BaseSettings

from app.utils.file_reader import BaseFileReader, TomlFileReader


_APP_DIR = Path(__file__).resolve().parent
_ROOT_DIR = _APP_DIR.parent


_reader: BaseFileReader[dict[str, Any]] = TomlFileReader()
pyproject_data = _reader.read(_ROOT_DIR / "pyproject.toml")


class WebSettings(BaseModel):
    PORT: int = 8000
    ENVIRONMENT: AppEnvEnum = AppEnvEnum.LOCAL
    HOST: str = "0.0.0.0"
    RELOAD: bool = True


class Settings(BaseSettings, WebSettings):
    SERVICE_NAME: str = pyproject_data["project"]["name"]
    SERVICE_VERSION: str = pyproject_data["project"]["version"]
    SERVICE_DESCRIPTION: str = pyproject_data["project"]["description"]


@cache
def get_app_settings() -> Settings:
    """Get application settings."""
    return Settings()


settings = get_app_settings()
