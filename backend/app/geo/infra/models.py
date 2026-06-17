from sqlalchemy import REAL, BigInteger, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import BaseDBModel


class GeonamesCity(BaseDBModel):
    """
    Газеттир GeoNames — read-only справочник городов (в рантайме не пишется, наполняется
    офлайн bulk-загрузкой данных GeoNames).

    Только города (GeoNames ``feature_class='P'``, население ≥ 5000) — природные объекты
    из газеттира исключены. Индексы объявлены здесь как источник истины (метадата →
    миграции): btree ``text_pattern_ops`` по ``lower(name_en)``/``lower(name_ru)`` под
    ПРЕФИКСНЫЙ автокомплит ``lower(name) LIKE 'q%'`` (range-scan любой длины запроса) +
    btree по ``country_code``.
    """

    __tablename__ = "geonames_cities"
    __table_args__ = (
        Index("ix_geonames_cities_name_en_prefix", text("lower(name_en) text_pattern_ops")),
        Index("ix_geonames_cities_name_ru_prefix", text("lower(name_ru) text_pattern_ops")),
        Index("ix_geonames_cities_country_code", "country_code"),
    )

    # geoname_id — натуральный ключ дампа GeoNames, НЕ автоинкремент.
    geoname_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    name_en: Mapped[str] = mapped_column(String(200))
    name_ru: Mapped[str | None] = mapped_column(String(200), default=None)
    country_code: Mapped[str] = mapped_column(String(2))
    latitude: Mapped[float] = mapped_column(REAL)
    longitude: Mapped[float] = mapped_column(REAL)
    population: Mapped[int] = mapped_column(Integer, server_default="0")
