class GeoPoint:
    """
    Снапшот географической точки (места) в поездке — value object.

    Денормализованный слепок места на момент создания поездки: подпись
    (``name``/``country_code``) + координаты. Поездка хранит именно слепок, а не ссылку на
    справочник — последующие правки/эвикция газеттира снапшот не меняют (историческая
    корректность). Идентичность точки — координаты (``latitude``/``longitude``): они
    уникально задают место и не зависят от вендора-источника.
    """

    def __init__(
        self,
        *,
        name: str,
        country_code: str,
        latitude: float,
        longitude: float,
    ) -> None:
        self._name = name
        self._country_code = country_code
        self._latitude = latitude
        self._longitude = longitude

    @property
    def name(self) -> str:
        return self._name

    @property
    def country_code(self) -> str:
        return self._country_code

    @property
    def latitude(self) -> float:
        return self._latitude

    @property
    def longitude(self) -> float:
        return self._longitude
