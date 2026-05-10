import datetime as dt


class TimestampedEntityMixin:
    """Mixin для добавления полей дат создания, обновления и удаления."""

    def __init__(
        self,
        *,
        created_at: dt.datetime | None = None,
        updated_at: dt.datetime | None = None,
        deleted_at: dt.datetime | None = None,
    ) -> None:
        """Инициализация смеси."""
        self._created_at = created_at or dt.datetime.now(tz=dt.UTC)
        self._updated_at = updated_at
        self._deleted_at = deleted_at

    @property
    def created_at(self) -> dt.datetime:
        return self._created_at

    @property
    def updated_at(self) -> dt.datetime | None:
        return self._updated_at

    @property
    def deleted_at(self) -> dt.datetime | None:
        return self._deleted_at

    def _mark_updated(self) -> None:
        """
        Помечает сущность как изменённую, обновляя ``updated_at`` текущим временем.

        Вызывается изнутри мутирующих методов наследников. Внешний код
        в норме не зовёт его напрямую — изменение состояния должно идти
        через явные доменные операции, которые сами вызывают ``_mark_updated``.
        """
        self._updated_at = dt.datetime.now(tz=dt.UTC)
