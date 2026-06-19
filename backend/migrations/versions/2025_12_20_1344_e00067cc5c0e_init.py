"""
Migration name: initial schema — users, user_credentials, refresh_tokens, challenges, geo_places, journeys

Revision ID: e00067cc5c0e
Revises: None
Create Date: 2025-12-20 13:44:53.248832
"""

# pylint: disable=no-member,invalid-name

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e00067cc5c0e"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("display_name", sa.String(length=50), nullable=True),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("marketing_emails_consent", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "user_credentials",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("user_id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user_credentials.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])
    op.create_table(
        "challenges",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("challenge_type", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user_credentials.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Один активный challenge данного типа на пользователя: композитный
    # партиальный unique-индекс по неиспользованным записям.
    op.create_index(
        "ix_challenges_active_user_id_type",
        "challenges",
        ["user_id", "challenge_type"],
        unique=True,
        postgresql_where=sa.text("used_at IS NULL"),
    )

    # Газеттир мест — read-only справочник-кэш для автокомплита поездки (наполняется офлайн
    # bulk-загрузкой; газеттир cities-only). id — суррогатный UUID (вендор-нейтральный, наружу);
    # external_id — вендорский ключ источника ("GeoNames:524901" → завтра "Google:..."), внутренний.
    op.create_table(
        "geo_places",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("name_en", sa.String(length=200), nullable=False),
        sa.Column("name_ru", sa.String(length=200), nullable=True),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("latitude", sa.REAL(), nullable=False),
        sa.Column("longitude", sa.REAL(), nullable=False),
        sa.Column("population", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id", name="uq_geo_places_external_id"),
    )
    # Префиксный автокомплит lower(name) LIKE 'q%' — btree text_pattern_ops по lower(name_*)
    # берётся range-scan'ом для запроса любой длины (даже 1 символ).
    op.create_index(
        "ix_geo_places_name_en_prefix",
        "geo_places",
        [sa.text("lower(name_en) text_pattern_ops")],
    )
    op.create_index(
        "ix_geo_places_name_ru_prefix",
        "geo_places",
        [sa.text("lower(name_ru) text_pattern_ops")],
    )
    # btree по country_code — фильтр/сужение выдачи автокомплита по стране.
    op.create_index("ix_geo_places_country_code", "geo_places", ["country_code"])

    # Поездка пользователя — плоский снапшот маршрута (без JSONB, без ссылки на справочник):
    # origin/destination денормализованы колонками (имя/страна/координаты), идентичность места
    # = координаты. user_id — без FK (другой домен), проиндексирован под выборки поездок юзера.
    op.create_table(
        "journeys",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("origin_name", sa.String(length=200), nullable=False),
        sa.Column("origin_country_code", sa.String(length=2), nullable=False),
        sa.Column("origin_latitude", sa.REAL(), nullable=False),
        sa.Column("origin_longitude", sa.REAL(), nullable=False),
        sa.Column("destination_name", sa.String(length=200), nullable=False),
        sa.Column("destination_country_code", sa.String(length=2), nullable=False),
        sa.Column("destination_latitude", sa.REAL(), nullable=False),
        sa.Column("destination_longitude", sa.REAL(), nullable=False),
        sa.Column("transport_type", sa.String(length=20), nullable=False),
        sa.Column("distance_km", sa.REAL(), nullable=False),
        sa.Column("traveled_on", sa.Date(), nullable=False),
        sa.Column("traveled_on_precision", sa.String(length=5), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_journeys_user_id", "journeys", ["user_id"])


def downgrade() -> None:
    # journeys и geo_places создаются последними в upgrade — дропаются первыми.
    op.drop_index("ix_journeys_user_id", table_name="journeys")
    op.drop_table("journeys")
    op.drop_index("ix_geo_places_country_code", table_name="geo_places")
    op.drop_index("ix_geo_places_name_ru_prefix", table_name="geo_places")
    op.drop_index("ix_geo_places_name_en_prefix", table_name="geo_places")
    op.drop_table("geo_places")
    op.drop_index(
        "ix_challenges_active_user_id_type",
        table_name="challenges",
        postgresql_where=sa.text("used_at IS NULL"),
    )
    op.drop_table("challenges")
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("user_credentials")
    op.drop_table("users")
