from uuid import UUID


class GeoPoint:
    """
    Точка маршрута поездки — место из справочника geo.

    Название места здесь не хранится: фронт запрашивает его у geo на нужном языке.
    """

    def __init__(
        self,
        *,
        place_id: UUID,
        country_code: str,
        latitude: float,
        longitude: float,
    ) -> None:
        self._place_id = place_id
        self._country_code = country_code
        self._latitude = latitude
        self._longitude = longitude

    @property
    def place_id(self) -> UUID:
        return self._place_id

    @property
    def country_code(self) -> str:
        return self._country_code

    @property
    def latitude(self) -> float:
        return self._latitude

    @property
    def longitude(self) -> float:
        return self._longitude
