from __future__ import annotations

from typing import Any, TypeVar, cast

from app.exceptions import ResourceNotFoundError

Resource = TypeVar("Resource")


class ResourceRegistry:
    """
    Позволяет типобезопасно работать с key:value хранилищем
    В качестве ключа используется класс, в качестве значения его экземпляр
    """

    _store: dict[type[Any], Any]

    def __init__(self, store: dict[type[Any], Any] | None = None) -> None:
        if store is None:
            store = {}

        self._store = store

    def set(self, key: type[Resource], value: Resource) -> None:
        self._store[key] = value

    def get(self, key: type[Resource]) -> Resource:
        try:
            return cast(Resource, self._store[key])
        except KeyError as err:
            raise ResourceNotFoundError(
                registry_class_name=self.__class__.__name__,
                resource_key=key,
            ) from err

    def __contains__(self, key: type[Resource]) -> bool:
        return key in self._store
