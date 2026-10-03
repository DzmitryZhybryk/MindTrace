from uuid import UUID

from app.geo.domain.enums import Language
from app.geo.domain.value_objects import PlaceNames


class PlaceEntity:
    """
    Место из газеттира. Только для чтения: газеттир меняет лишь загрузчик датасетов.

    ``place_id`` — наш id места, не ключ поставщика: его можно отдавать наружу и хранить.
    Названия на разных языках — в ``PlaceNames``.
    """

    def __init__(
        self,
        *,
        place_id: UUID,
        names: PlaceNames,
        country_code: str | None,
        latitude: float,
        longitude: float,
        population: int | None,
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
