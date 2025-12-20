from abc import ABC, abstractmethod

from app.infra.components.registry import ResourceRegistry
from app.infra.helthcheck import BaseHealthCheck, BaseStartCheck


class BaseComponent(BaseHealthCheck, BaseStartCheck, ABC):
    @abstractmethod
    async def startup(self, registry: ResourceRegistry) -> None:
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        pass
