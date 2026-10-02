from dataclasses import dataclass
from typing import Annotated

from pydantic import Field

from app.shared.schemas import CamelModel


class CursorPageRequest(CamelModel):
    """
    Поля запроса страницы списка (query-параметры).

    Запрос конкретного списка наследуется от него и добавляет свои фильтры. Без ``cursor``
    отдаётся первая страница, дальше — ``nextCursor`` из предыдущего ответа.
    """

    # Курсор — несколько значений ключа сортировки; строка длиннее заведомо не наша.
    cursor: Annotated[str | None, Field(max_length=512)] = None
    limit: Annotated[int, Field(ge=1, le=100)] = 50


class CursorPageResponse[ItemT](CamelModel):
    """
    Страница списка в ответе.

    Ответ конкретного списка — наследник с подставленным типом элемента, а не алиас: так у
    схемы в OpenAPI своё имя. ``nextCursor`` = ``null`` — страница последняя.
    """

    items: list[ItemT]
    next_cursor: str | None


@dataclass(frozen=True, slots=True)
class PageQuery:
    """
    Какую страницу списка отдать: курсор (``None`` — первая страница) и её размер.

    Входит полем в команду списка рядом с её фильтрами.
    """

    cursor: str | None
    limit: int


@dataclass(frozen=True, slots=True)
class CursorPage[ItemT]:
    """Страница списка и курсор следующей; ``next_cursor`` = ``None`` — страница последняя."""

    items: tuple[ItemT, ...]
    next_cursor: str | None
