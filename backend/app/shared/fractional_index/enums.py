from enum import StrEnum


class MovePlacement(StrEnum):
    """С какой стороны от строки-соседа встаёт переносимая строка в ручном порядке."""

    AFTER = "after"
    BEFORE = "before"
