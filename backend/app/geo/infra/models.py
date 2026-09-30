import datetime as dt
import uuid

from sqlalchemy import REAL, DateTime, Index, Integer, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import BaseDBModel


class GeoPlace(BaseDBModel):
    """
    Место газеттира.

    Индексы:
        ix_geo_places_name_en_prefix: btree ``lower(name_en) text_pattern_ops`` — автокомплит
            по английскому имени (``LIKE 'q%'``).
        ix_geo_places_name_ru_prefix: то же по ``lower(name_ru)`` — автокомплит по русскому.
    """

    __tablename__ = "geo_places"
    __table_args__ = (
        Index("ix_geo_places_name_en_prefix", text("lower(name_en) text_pattern_ops")),
        Index("ix_geo_places_name_ru_prefix", text("lower(name_ru) text_pattern_ops")),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(255), unique=True)
    kind: Mapped[str] = mapped_column(String(20))
    name_en: Mapped[str] = mapped_column(String(200))
    name_ru: Mapped[str | None] = mapped_column(String(200))
    country_code: Mapped[str | None] = mapped_column(String(2))
    latitude: Mapped[float] = mapped_column(REAL)
    longitude: Mapped[float] = mapped_column(REAL)
    population: Mapped[int | None] = mapped_column(Integer)


class GeoDatasetLoad(BaseDBModel):
    """
    Журнал загрузок датасетов газеттира.

    Перед загрузкой загрузчик ищет здесь строку с именем, версией и sha256 датасета из
    ``manifest.toml``: нашёл — пропускает датасет, нет — загружает и записывает строку.
    Так повторный запуск ничего не скачивает, а новая версия в манифесте подхватывается.
    """

    __tablename__ = "geo_dataset_loads"

    name: Mapped[str] = mapped_column(String(100), primary_key=True)
    version: Mapped[str] = mapped_column(String(50))
    sha256: Mapped[str] = mapped_column(String(64))
    loaded_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
