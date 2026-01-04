from __future__ import annotations

from typing import Any, TypeVar, cast

from app.shared.infra.components.exceptions import ComponentNotRegisteredError

Component = TypeVar("Component")


class ComponentRegistry:
    """
    Позволяет типобезопасно работать с хранилищем компонентов инфраструктуры.
    В качестве ключа используется класс компонента, в качестве значения его экземпляр.
    """

    _store: dict[type[Any], Any]

    def __init__(self, store: dict[type[Any], Any] | None = None) -> None:
        if store is None:
            store = {}

        self._store = store

    def set(self, key: type[Component], value: Component) -> None:
        self._store[key] = value

    def get(self, key: type[Component]) -> Component:
        try:
            return cast(Component, self._store[key])
        except KeyError as err:
            raise ComponentNotRegisteredError(
                message=f"{self.__class__.__name__} object has no attribute {key}"
            ) from err

    def __contains__(self, key: type[Component]) -> bool:
        return key in self._store
