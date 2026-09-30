import datetime as dt
import uuid

from sqlalchemy import REAL, Date, SmallInteger, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import BaseDBModel
from app.shared.models.base_model import DateTimeMixin


class Journey(DateTimeMixin, BaseDBModel):
    """
    Поездка пользователя: откуда, куда, на чём и когда.

    Места — ссылки на справочник geo плюс страна и координаты, названий здесь нет. Внешних
    ключей на geo и users нет: это другие домены. Дата хранится первым днём известного
    периода, а её точность (год, месяц или день) — в ``traveled_on_precision``.
    """

    __tablename__ = "journeys"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(index=True)

    origin_place_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    origin_country_code: Mapped[str] = mapped_column(String(2))
    origin_latitude: Mapped[float] = mapped_column(REAL)
    origin_longitude: Mapped[float] = mapped_column(REAL)

    destination_place_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    destination_country_code: Mapped[str] = mapped_column(String(2))
    destination_latitude: Mapped[float] = mapped_column(REAL)
    destination_longitude: Mapped[float] = mapped_column(REAL)

    transport_type: Mapped[str] = mapped_column(String(20))
    distance_km: Mapped[int] = mapped_column(SmallInteger)
    traveled_on: Mapped[dt.date] = mapped_column(Date)
    traveled_on_precision: Mapped[str] = mapped_column(String(5))
