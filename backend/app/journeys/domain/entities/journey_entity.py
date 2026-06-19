import datetime as dt
import math
from typing import Self
from uuid import UUID, uuid4

from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import ApproximateDate, GeoPoint
from app.journeys.exceptions import SameOriginAndDestinationError
from app.shared.domain.domain_mixins import TimestampedEntityMixin

# Средний радиус Земли в километрах для great-circle оценки расстояния поездки.
EARTH_RADIUS_KM = 6371.0


class JourneyEntity(TimestampedEntityMixin):
    """
    Поездка пользователя: маршрут origin→destination, среда передвижения, приблизительная дата.

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
        traveled_on: ApproximateDate,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.journey_id = journey_id
        self.user_id = user_id
        self.origin = origin
        self.destination = destination
        self.transport_type = transport_type
        self.traveled_on = traveled_on
        self.distance_km = self._great_circle_km(origin=origin, destination=destination)

    @classmethod
    def create(
        cls,
        *,
        user_id: UUID,
        origin: GeoPoint,
        destination: GeoPoint,
        transport_type: TransportType,
        traveled_on: ApproximateDate,
    ) -> Self:
        """
        Создаёт новую поездку с собственным идентификатором, проверяя инвариант «origin ≠ destination».

        Идентификатор сущность генерирует сама (``uuid4``), как и прочие фабрики домена;
        снаружи он передаётся только при реконституции из БД через ``__init__``. Расстояние
        считать снаружи тоже не нужно — сущность выводит ``distance_km`` сама в конструкторе.

        Args:
            user_id: Владелец поездки
            origin: Снапшот места отправления
            destination: Снапшот места назначения
            transport_type: Среда передвижения
            traveled_on: Приблизительная дата поездки

        Returns:
            Новая поездка с вычисленным расстоянием

        Raises:
            SameOriginAndDestinationError: origin и destination — одно и то же место
        """
        cls._ensure_distinct_endpoints(origin=origin, destination=destination)

        return cls(
            journey_id=uuid4(),
            user_id=user_id,
            origin=origin,
            destination=destination,
            transport_type=transport_type,
            traveled_on=traveled_on,
        )

    @staticmethod
    def _ensure_distinct_endpoints(*, origin: GeoPoint, destination: GeoPoint) -> None:
        """
        Проверяет инвариант «origin ≠ destination»: одно и то же место запрещено.

        Идентичность места — координаты: для одинакового выбора они совпадают побитово
        (обе точки из одного снапшота-источника), у разных мест различаются.

        Args:
            origin: Снапшот места отправления
            destination: Снапшот места назначения

        Raises:
            SameOriginAndDestinationError: широта и долгота точек совпадают
        """
        if origin.latitude == destination.latitude and origin.longitude == destination.longitude:
            raise SameOriginAndDestinationError()

    @staticmethod
    def _great_circle_km(*, origin: GeoPoint, destination: GeoPoint) -> float:
        """
        Считает расстояние по большой окружности (haversine) между точками маршрута, км.

        Сферическая оценка по средней модели Земли (без эллипсоидности) — для
        схематичной карты поездок этого достаточно.

        Args:
            origin: Снапшот места отправления
            destination: Снапшот места назначения

        Returns:
            Расстояние между точками маршрута в километрах
        """
        start_phi = math.radians(origin.latitude)
        end_phi = math.radians(destination.latitude)
        delta_phi = math.radians(destination.latitude - origin.latitude)
        delta_lambda = math.radians(destination.longitude - origin.longitude)
        a = math.sin(delta_phi / 2) ** 2 + math.cos(start_phi) * math.cos(end_phi) * math.sin(delta_lambda / 2) ** 2
        return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))
