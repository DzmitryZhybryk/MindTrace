from enum import StrEnum


class Language(StrEnum):
    """
    Язык отображаемого имени места в автокомплите.

    Закрытое множество поддерживаемых языков газеттира: имена импортируются только
    для ``en``/``ru``. Используется как тип query-параметра ``language`` на границе HTTP
    и как ключ резолва имени в ``PlaceEntity.display_name``.
    """

    EN = "en"
    RU = "ru"
