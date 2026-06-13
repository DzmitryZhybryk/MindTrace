from functools import cache
from pathlib import Path
from typing import Final

from pydantic import BaseModel, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.shared.enums import AppEnvEnum
from app.shared.types import DictStrAny
from app.shared.utils.file_reader import read_file

_APP_DIR: Final[Path] = Path(__file__).resolve().parent
_ROOT_DIR: Final[Path] = _APP_DIR.parent.parent


_PYPROJECT_DATA: Final[DictStrAny] = read_file(_ROOT_DIR / "pyproject.toml")


class PostgresSettings(BaseModel):
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
    POSTGRES_STATEMENT_TIMEOUT_MS: int = 10_000  # statement_timeout сервера в миллисекундах

    @property
    def postgres_dsn(self) -> str:
        """
        Собирает SQLAlchemy DSN.

        Драйвер — psycopg3 (async). Выбран сознательно вместо asyncpg, чтобы
        procrastinate.PsycopgConnector мог делить connection с SQLAlchemy
        для атомарного defer_async() в одной транзакции.
        """
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def procrastinate_dsn(self) -> str:
        """
        Plain libpq DSN для procrastinate.PsycopgConnector (без +driver-префикса).

        Procrastinate шарит БД с приложением — отдельная инстанция PG не предусмотрена.
        """
        return (
            f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
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
                "connect_timeout": self.POSTGRES_CONNECTION_TIMEOUT,
                "options": f"-c statement_timeout={self.POSTGRES_STATEMENT_TIMEOUT_MS}",
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


class JWTSettings(BaseModel):
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30


class ResendSettings(BaseModel):
    RESEND_API_KEY: SecretStr
    RESEND_FROM_EMAIL: str
    RESEND_BASE_URL: str = "https://api.resend.com"
    RESEND_TIMEOUT_SECONDS: float = 10.0


class EmailVerificationSettings(BaseModel):
    EMAIL_VERIFICATION_TTL_MINUTES: int = 15
    EMAIL_VERIFICATION_MAX_ATTEMPTS: int = 5
    EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: int = 60


class ProcrastinateSettings(PostgresSettings):
    """
    Procrastinate шарит БД с приложением — наследует PG-конфиг для DSN.

    Procrastinate-специфичны только пул и concurrency; connection info
    приходит через ``procrastinate_dsn`` из ``PostgresSettings``.
    """

    PROCRASTINATE_POOL_MIN_SIZE: int = 2
    PROCRASTINATE_POOL_MAX_SIZE: int = 5
    PROCRASTINATE_WORKER_CONCURRENCY: int = 10


class Settings(
    BaseSettings,
    WebSettings,
    JWTSettings,
    ResendSettings,
    EmailVerificationSettings,
    ProcrastinateSettings,
):
    SERVICE_NAME: str = _PYPROJECT_DATA["project"]["name"]
    SERVICE_VERSION: str = _PYPROJECT_DATA["project"]["version"]
    SERVICE_DESCRIPTION: str = _PYPROJECT_DATA["project"]["description"]

    model_config = SettingsConfigDict(frozen=True, env_file=".env", extra="ignore")


@cache
def get_app_settings() -> Settings:
    """Get application settings."""
    return Settings()


settings = get_app_settings()
