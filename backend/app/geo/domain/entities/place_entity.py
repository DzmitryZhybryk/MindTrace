from uuid import UUID

from app.geo.domain.enums import Language
from app.geo.domain.value_objects import PlaceNames


class PlaceEntity:
    """
    Место из газеттира (read-only справочник-кэш).

    Идентичность — собственный суррогатный ``place_id`` (UUID), а НЕ вендорский ключ
    источника: справочник переживёт смену гео-вендора (GeoNames → Google), поэтому наружу
    отдаём свой стабильный id, а провенанс источника (``external_id`` вида
    ``"GeoNames:524901"``) живёт только в infra-модели. Сущность read-only: газеттир —
    справочник, поездка хранит снапшот места, сам справочник из домена не меняется.
    Разноязычные имена инкапсулированы в ``PlaceNames`` — резолв под язык делегируется ему.
    """

    def __init__(
        self,
        *,
        place_id: UUID,
        names: PlaceNames,
        country_code: str,
        latitude: float,
        longitude: float,
        population: int,
    ) -> None:
        self.place_id = place_id
        self.names = names
        self.country_code = country_code
        self.latitude = latitude
        self.longitude = longitude
        self.population = population

    def localized_name(self, *, language: Language) -> str | None:
        """
        Возвращает собственное имя места на языке ``language`` (без фоллбэка).

        Сервис использует ``None`` как сигнал качества данных: пользователю отдаётся
        место без перевода на его язык — такие места потом бэкфиллятся вручную.

        Args:
            language: Запрашиваемый язык

        Returns:
            Имя на ``language`` либо ``None``, если перевода нет
        """
        return self.names.get(language=language)

    def display_name(self, *, language: Language) -> str:
        """
        Возвращает отображаемое имя места под ``language`` с фоллбэком на ``name_en``.

        Args:
            language: Язык отображения

        Returns:
            Имя на ``language``, иначе канонический ``name_en``
        """
        return self.names.display(language=language)
