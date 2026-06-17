from app.geo.domain.enums import Language
from app.geo.domain.value_objects import CityNames


class City:
    """
    Город из газеттира GeoNames (read-only).

    Идентичность — ``geoname_id`` (натуральный ключ дампа, НЕ имя: тёзки различаются
    по id). Сущность read-only: газеттир — справочник, поездка хранит снапшот города,
    сам справочник из домена не меняется. Разноязычные имена инкапсулированы в
    ``CityNames`` (а не лежат отдельными полями) — резолв под язык делегируется ему.
    """

    def __init__(
        self,
        *,
        geoname_id: int,
        names: CityNames,
        country_code: str,
        latitude: float,
        longitude: float,
        population: int,
    ) -> None:
        self.geoname_id = geoname_id
        self.names = names
        self.country_code = country_code
        self.latitude = latitude
        self.longitude = longitude
        self.population = population

    def localized_name(self, *, language: Language) -> str | None:
        """
        Возвращает собственное имя города на языке ``language`` (без фоллбэка).

        Сервис использует ``None`` как сигнал качества данных: пользователю отдаётся
        город без перевода на его язык — такие города потом бэкфиллятся вручную.

        Args:
            language: Запрашиваемый язык

        Returns:
            Имя на ``language`` либо ``None``, если перевода нет
        """
        return self.names.get(language=language)

    def display_name(self, *, language: Language) -> str:
        """
        Возвращает отображаемое имя города под ``language`` с фоллбэком на ``name_en``.

        Args:
            language: Язык отображения

        Returns:
            Имя на ``language``, иначе канонический ``name_en``
        """
        return self.names.display(language=language)
