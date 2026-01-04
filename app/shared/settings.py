from functools import cache
from pathlib import Path
from typing import Final

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.shared.enums import AppEnvEnum
from app.shared.types import DictStrAny
from app.shared.utils.file_reader import read_file

_APP_DIR: Final[Path] = Path(__file__).resolve().parent
_ROOT_DIR: Final[Path] = _APP_DIR.parent.parent


_PYPROJECT_DATA: Final[DictStrAny] = read_file(_ROOT_DIR / "pyproject.toml")


class PostgressSettings(BaseModel):
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
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
    def postgres_dsn(self) -> str:
        """Собирает DSN из отдельных параметров PostgreSQL."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

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
    SERVICE_NAME: str = _PYPROJECT_DATA["project"]["name"]
    SERVICE_VERSION: str = _PYPROJECT_DATA["project"]["version"]
    SERVICE_DESCRIPTION: str = _PYPROJECT_DATA["project"]["description"]

    model_config = SettingsConfigDict(frozen=True, env_file=".env")


@cache
def get_app_settings() -> Settings:
    """Get application settings."""
    return Settings()


settings = get_app_settings()
