import datetime as dt
import uuid

from sqlalchemy import REAL, Date, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import BaseDBModel
from app.shared.models.base_model import DateTimeMixin


class Journey(DateTimeMixin, BaseDBModel):
    """
    Поездка пользователя — плоское хранение снапшота маршрута (без JSONB).

    origin/destination денормализованы колонками: снапшот места из тела запроса на момент
    создания (имя + страна + координаты). Ссылки на справочник geo НЕТ — поездка
    самодостаточна (payload-on-create), идентичность места = координаты. ``user_id`` —
    БЕЗ FK (другой домен; развязка под будущий распил на сервисы), но проиндексирован под
    выборки поездок пользователя. ``distance_km`` — снапшот great-circle расстояния;
    ``traveled_on`` нормализован до 1-го числа разряда, реальная точность — в
    ``traveled_on_precision``.
    """

    __tablename__ = "journeys"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(index=True)

    origin_name: Mapped[str] = mapped_column(String(200))
    origin_country_code: Mapped[str] = mapped_column(String(2))
    origin_latitude: Mapped[float] = mapped_column(REAL)
    origin_longitude: Mapped[float] = mapped_column(REAL)

    destination_name: Mapped[str] = mapped_column(String(200))
    destination_country_code: Mapped[str] = mapped_column(String(2))
    destination_latitude: Mapped[float] = mapped_column(REAL)
    destination_longitude: Mapped[float] = mapped_column(REAL)

    transport_type: Mapped[str] = mapped_column(String(20))
    distance_km: Mapped[int] = mapped_column(SmallInteger)
    traveled_on: Mapped[dt.date] = mapped_column(Date)
    traveled_on_precision: Mapped[str] = mapped_column(String(5))
