import datetime as dt
from typing import Self
from uuid import UUID, uuid4

from app.journeys.domain.enums import TransportType
from app.journeys.domain.value_objects import GeoPoint
from app.journeys.exceptions import JourneyNotFoundError
from app.shared.domain.domain_mixins import TimestampedEntityMixin


class JourneyEntity(TimestampedEntityMixin):
    """
    Поездка пользователя: маршрут origin→destination, среда передвижения, расстояние и год.

    ``distance_km`` считает application-слой по координатам маршрута (``great_circle_km``).
    ``sort_key`` — место поездки среди поездок того же года (дробный ключ, см.
    ``app.shared.fractional_index``).
    """

    def __init__(
        self,
        *,
        journey_id: UUID,
        user_id: UUID,
        origin: GeoPoint,
        destination: GeoPoint,
        transport_type: TransportType,
        distance_km: int,
        traveled_year: int,
        sort_key: str,
        **timestamp_kwargs: dt.datetime | None,
    ) -> None:
        super().__init__(**timestamp_kwargs)
        self.journey_id = journey_id
        self.user_id = user_id
        self.origin = origin
        self.destination = destination
        self.transport_type = transport_type
        self.distance_km = distance_km
        self.traveled_year = traveled_year
        self.sort_key = sort_key

    @classmethod
    def create(
        cls,
        *,
        user_id: UUID,
        origin: GeoPoint,
        destination: GeoPoint,
        transport_type: TransportType,
        distance_km: int,
        traveled_year: int,
        sort_key: str,
    ) -> Self:
        """
        Создаёт новую поездку с собственным идентификатором.

        Идентификатор сущность генерирует сама (``uuid4``), как и прочие фабрики домена;
        снаружи он передаётся только при реконституции из БД через ``__init__``.

        Args:
            user_id: Владелец поездки
            origin: Место отправления
            destination: Место назначения
            transport_type: Среда передвижения
            distance_km: Расстояние маршрута, км
            traveled_year: Год поездки
            sort_key: Место среди поездок того же года

        Returns:
            Новая поездка
        """
        return cls(
            journey_id=uuid4(),
            user_id=user_id,
            origin=origin,
            destination=destination,
            transport_type=transport_type,
            distance_km=distance_km,
            traveled_year=traveled_year,
            sort_key=sort_key,
        )

    def ensure_not_deleted(self) -> None:
        """
        Гарантирует, что поездка не удалена.

        Raises:
            JourneyNotFoundError: поездка удалена (soft-delete)
        """
        if self.is_deleted:
            raise JourneyNotFoundError()

    def revise(
        self,
        *,
        origin: GeoPoint,
        destination: GeoPoint,
        transport_type: TransportType,
        distance_km: int,
    ) -> None:
        """
        Заменяет маршрут, транспорт и расстояние поездки.

        Args:
            origin: Место отправления
            destination: Место назначения
            transport_type: Среда передвижения
            distance_km: Расстояние нового маршрута, км
        """
        self.origin = origin
        self.destination = destination
        self.transport_type = transport_type
        self.distance_km = distance_km
        self._mark_updated()

    def move(self, *, traveled_year: int, sort_key: str) -> None:
        """
        Ставит поездку на новое место: в другой год и/или на другую позицию внутри года.

        Год и ключ меняются только вместе: ключ имеет смысл лишь среди поездок своего года.

        Args:
            traveled_year: Год поездки
            sort_key: Место среди поездок этого года
        """
        self.traveled_year = traveled_year
        self.sort_key = sort_key
        self._mark_updated()

    def delete(self) -> None:
        """Помечает поездку удалённой (soft-delete)."""
        self._mark_deleted()
