from pydantic import SecretStr

from app.shared.settings import JWTSettings, PostgresSettings


def test_postgres_settings_password_hidden_in_repr_but_present_in_dsn() -> None:
    """Пароль БД не попадает в repr, но развёрнут в обоих DSN."""
    postgres_settings = PostgresSettings(
        POSTGRES_USER="user",
        POSTGRES_PASSWORD=SecretStr("s3cret-pw"),
        POSTGRES_DB="db",
    )

    assert "s3cret-pw" not in repr(postgres_settings)
    assert postgres_settings.postgres_dsn == "postgresql+psycopg://user:s3cret-pw@localhost:5432/db"
    assert postgres_settings.postgres_libpq_dsn == "postgresql://user:s3cret-pw@localhost:5432/db"


def test_jwt_settings_secret_key_hidden_in_repr() -> None:
    """Ключ подписи JWT не попадает в repr настроек."""
    jwt_settings = JWTSettings(JWT_SECRET_KEY=SecretStr("signing-key"))

    assert "signing-key" not in repr(jwt_settings)
