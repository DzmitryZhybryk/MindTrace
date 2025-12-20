from functools import cache
from pathlib import Path

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.enums import AppEnvEnum
from app.types import DictStrAny
from app.utils.file_reader import read_file

_APP_DIR = Path(__file__).resolve().parent
_ROOT_DIR = _APP_DIR.parent


pyproject_data = read_file(_ROOT_DIR / "pyproject.toml")


class PostgressSettings(BaseModel):
    POSTGRES_DSN: str
    POSTGRES_POOL_PRE_PING: bool = True  # ВКЛЮЧЕНО: Проверка соединений перед использованием
    POSTGRES_POOL_RECYCLE: int = 3600  # Переустановка соединений старше 1 часа
    POSTGRES_POOL_TIMEOUT: int = 30
    POSTGRES_POOL_SIZE: int = 5
    POSTGRES_MAX_OVERFLOW: int = 10
    POSTGRES_ISOLATION_LEVEL: str = "READ COMMITTED"
    POSTGRES_ECHO: bool = False
    POSTGRES_CONNECTION_TIMEOUT: int = 5  # Таймаут для установки нового соединения
    POSTGRES_COMMAND_TIMEOUT: int = 10  # Таймаут для выполнения любой команды

    @property
    def engine_kwargs(self) -> DictStrAny:
        return {
            "pool_size": self.POSTGRES_POOL_SIZE,
            "max_overflow": self.POSTGRES_MAX_OVERFLOW,
            "echo": self.POSTGRES_ECHO,
            "pool_pre_ping": self.POSTGRES_POOL_PRE_PING,
            "pool_recycle": self.POSTGRES_POOL_RECYCLE,
            "pool_timeout": self.POSTGRES_POOL_TIMEOUT,
            "isolation_level": self.POSTGRES_ISOLATION_LEVEL,
            "connect_args": {
                "timeout": self.POSTGRES_CONNECTION_TIMEOUT,
                "command_timeout": self.POSTGRES_COMMAND_TIMEOUT,
            },
        }

    @property
    def sessionmaker_kwargs(self) -> DictStrAny:
        return {"expire_on_commit": False}


class WebSettings(BaseModel):
    PORT: int
    HOST: str
    ENVIRONMENT: AppEnvEnum
    RELOAD: bool = False


class Settings(BaseSettings, WebSettings, PostgressSettings):
    SERVICE_NAME: str = pyproject_data["project"]["name"]
    SERVICE_VERSION: str = pyproject_data["project"]["version"]
    SERVICE_DESCRIPTION: str = pyproject_data["project"]["description"]

    model_config = SettingsConfigDict(frozen=True, env_file=".env")


@cache
def get_app_settings() -> Settings:
    """Get application settings."""
    return Settings()


settings = get_app_settings()
