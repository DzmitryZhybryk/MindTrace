import datetime as dt
import math
from typing import Self
from uuid import UUID, uuid4

from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint
from app.shared.domain.domain_mixins import TimestampedEntityMixin

# Средний радиус Земли в километрах для great-circle оценки расстояния поездки.
EARTH_RADIUS_KM = 6371.0


class JourneyEntity(TimestampedEntityMixin):
    """
    Поездка пользователя: маршрут origin→destination, среда передвижения и год.

    ``distance_km`` сущность выводит сама из координат точек (haversine) — снаружи его
    передать нельзя, поэтому расстояние всегда консистентно с маршрутом.
    """

    def __init__(
        self,
        *,
        journey_id: UUID,
        user_id: UUID,
        origin: GeoPoint,
        destination: GeoPoint,
        transport_type: TransportType,
        traveled_year: int,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.journey_id = journey_id
        self.user_id = user_id
        self.origin = origin
        self.destination = destination
        self.transport_type = transport_type
        self.traveled_year = traveled_year
        self.distance_km = self._great_circle_km(origin=origin, destination=destination)

    @classmethod
    def create(
        cls,
        *,
        user_id: UUID,
        origin: GeoPoint,
        destination: GeoPoint,
        transport_type: TransportType,
        traveled_year: int,
    ) -> Self:
        """
        Создаёт новую поездку с собственным идентификатором.

        Идентификатор сущность генерирует сама (``uuid4``), как и прочие фабрики домена;
        снаружи он передаётся только при реконституции из БД через ``__init__``. Расстояние
        считать снаружи тоже не нужно — сущность выводит ``distance_km`` сама в конструкторе.

        Args:
            user_id: Владелец поездки
            origin: Место отправления
            destination: Место назначения
            transport_type: Среда передвижения
            traveled_year: Год поездки

        Returns:
            Новая поездка с вычисленным расстоянием
        """
        return cls(
            journey_id=uuid4(),
            user_id=user_id,
            origin=origin,
            destination=destination,
            transport_type=transport_type,
            traveled_year=traveled_year,
        )

    @staticmethod
    def _great_circle_km(*, origin: GeoPoint, destination: GeoPoint) -> int:
        """
        Считает расстояние по большой окружности (haversine) между точками маршрута, км.

        Сферическая оценка по средней модели Земли (без эллипсоидности) — для
        схематичной карты поездок этого достаточно.

        Args:
            origin: Место отправления
            destination: Место назначения

        Returns:
            Расстояние между точками маршрута в километрах, округлённое до ближайшего целого
        """
        start_phi = math.radians(origin.latitude)
        end_phi = math.radians(destination.latitude)
        delta_phi = math.radians(destination.latitude - origin.latitude)
        delta_lambda = math.radians(destination.longitude - origin.longitude)
        a = math.sin(delta_phi / 2) ** 2 + math.cos(start_phi) * math.cos(end_phi) * math.sin(delta_lambda / 2) ** 2
        distance_km = 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))
        return round(distance_km)
