import uuid

from sqlalchemy import REAL, Index, Integer, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import BaseDBModel


class GeoPlace(BaseDBModel):
    """
    Газеттир городов — read-only справочник-кэш (наполняется офлайн bulk-загрузкой;
    в обычном рантайме поиска не пишется).

    Идентичность строки — собственный суррогатный ``id`` (UUID), вендор-нейтральный: наружу
    отдаём его, а вендорский ключ источника живёт в ``external_id`` (``"GeoNames:524901"`` →
    завтра ``"Google:ChIJ..."``, self-describing по префиксу). ``external_id`` — внутренний:
    дедуп-ключ кэша (не закэшировать одно место дважды) + провенанс; наружу НЕ выходит.
    ``kind`` — тип места (газеттир cities-only, сейчас всегда ``'city'``; зарезервирована под не-городские).

    Индексы объявлены здесь как источник истины (метадата → миграции): btree
    ``text_pattern_ops`` по ``lower(name_en)``/``lower(name_ru)`` под ПРЕФИКСНЫЙ автокомплит
    ``lower(name) LIKE 'q%'`` (range-scan любой длины запроса) + btree по ``country_code``;
    уникальный индекс по ``external_id`` создаётся через ``unique=True``.
    """

    __tablename__ = "geo_places"
    __table_args__ = (
        Index("ix_geo_places_name_en_prefix", text("lower(name_en) text_pattern_ops")),
        Index("ix_geo_places_name_ru_prefix", text("lower(name_ru) text_pattern_ops")),
        Index("ix_geo_places_country_code", "country_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    external_id: Mapped[str] = mapped_column(String(255), unique=True)
    kind: Mapped[str] = mapped_column(String(20))
    name_en: Mapped[str] = mapped_column(String(200))
    name_ru: Mapped[str | None] = mapped_column(String(200))
    country_code: Mapped[str] = mapped_column(String(2))
    latitude: Mapped[float] = mapped_column(REAL)
    longitude: Mapped[float] = mapped_column(REAL)
    population: Mapped[int] = mapped_column(Integer, server_default="0")
