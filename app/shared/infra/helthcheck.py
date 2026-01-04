import asyncio
from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

from app.shared.schemas.base import BaseCheckReport


class BaseHealthCheck(ABC):
    @abstractmethod
    async def healthcheck(self) -> None:
        pass


class BaseStartCheck(ABC):
    @abstractmethod
    async def startcheck(self) -> None:
        pass


class BaseCheckable[T](ABC):
    def __init__(self, component: T) -> None:
        self.component = component

    @abstractmethod
    async def check(self) -> None:
        pass


class HealthCheckable(BaseCheckable[BaseHealthCheck]):
    async def check(self) -> None:
        return await self.component.healthcheck()


class StartCheckable(BaseCheckable[BaseStartCheck]):
    async def check(self) -> None:
        return await self.component.startcheck()


class GatherChecks[T: BaseCheckable[Any]]:
    def __init__(self, checkable: Sequence[T]) -> None:
        self._to_check = checkable

    async def _create_report(self, obj: T) -> BaseCheckReport:
        component_name = type(obj.component).__name__
        try:
            await obj.check()
            return BaseCheckReport(component_name=component_name, error=None)
        except Exception as e:
            return BaseCheckReport(component_name=component_name, error=repr(e))

    async def check(self) -> list[BaseCheckReport]:
        coros = (self._create_report(comp) for comp in self._to_check)
        return await asyncio.gather(*coros)
