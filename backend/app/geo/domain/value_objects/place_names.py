from app.geo.domain.enums import Language


class PlaceNames:
    """
    Имена места по языкам (value object).

    Группирует разноязычные написания места в один тип, чтобы они не болтались
    отдельными полями на ``Place``. Резолв имени — единый параметризованный (``get``
    без фоллбэка / ``display`` с фоллбэком), а не метод-на-язык: добавить язык =
    один kwarg конструктора плюс его попадание в ``_by_language``.

    Инвариант: ``en`` присутствует всегда (колонка ``name_en`` NOT NULL — канонический
    ярлык, фоллбэк для языков без перевода). Хранилище имён (плоские колонки сейчас или
    нормализованная таблица позже) этому VO безразлично — его наполняет репозиторий.
    """

    def __init__(self, *, en: str, ru: str | None = None) -> None:
        self._by_language: dict[Language, str] = {Language.EN: en}
        if ru is not None:
            self._by_language[Language.RU] = ru

    def get(self, *, language: Language) -> str | None:
        """
        Возвращает собственное имя на языке ``language`` без фоллбэка.

        Args:
            language: Запрашиваемый язык

        Returns:
            Имя на ``language`` либо ``None``, если перевода нет
        """
        return self._by_language.get(language)

    def display(self, *, language: Language) -> str:
        """
        Возвращает имя под ``language`` с фоллбэком на канонический ``Language.EN``.

        Args:
            language: Язык отображения

        Returns:
            Имя на ``language``, иначе ``en``
        """
        return self._by_language.get(language) or self._by_language[Language.EN]
