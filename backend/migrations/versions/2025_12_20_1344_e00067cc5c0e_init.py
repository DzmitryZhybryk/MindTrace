"""
Migration name: initial schema — users, user_credentials, refresh_tokens, challenges, geonames_cities

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

    # Газеттир GeoNames — read-only справочник ГОРОДОВ (feature_class='P', население ≥ 5000)
    # для автокомплита поездки. Наполняется офлайн bulk-загрузкой данных GeoNames.
    op.create_table(
        "geonames_cities",
        # geoname_id — натуральный ключ из дампа GeoNames, НЕ автоинкремент.
        sa.Column("geoname_id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("name_en", sa.String(length=200), nullable=False),
        sa.Column("name_ru", sa.String(length=200), nullable=True),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("latitude", sa.REAL(), nullable=False),
        sa.Column("longitude", sa.REAL(), nullable=False),
        sa.Column("population", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("geoname_id"),
    )
    # Префиксный автокомплит lower(name) LIKE 'q%' — btree text_pattern_ops по lower(name_*)
    # берётся range-scan'ом для запроса любой длины (даже 1 символ).
    op.create_index(
        "ix_geonames_cities_name_en_prefix",
        "geonames_cities",
        [sa.text("lower(name_en) text_pattern_ops")],
    )
    op.create_index(
        "ix_geonames_cities_name_ru_prefix",
        "geonames_cities",
        [sa.text("lower(name_ru) text_pattern_ops")],
    )
    # btree по country_code — фильтр/сужение выдачи автокомплита по стране.
    op.create_index("ix_geonames_cities_country_code", "geonames_cities", ["country_code"])


def downgrade() -> None:
    # geonames_cities создаётся последней в upgrade — дропается первой.
    op.drop_index("ix_geonames_cities_country_code", table_name="geonames_cities")
    op.drop_index("ix_geonames_cities_name_ru_prefix", table_name="geonames_cities")
    op.drop_index("ix_geonames_cities_name_en_prefix", table_name="geonames_cities")
    op.drop_table("geonames_cities")
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
