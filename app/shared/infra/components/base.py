from abc import ABC, abstractmethod

from app.shared.infra.components.registry import ComponentRegistry
from app.shared.infra.helthcheck import BaseHealthCheck, BaseStartCheck


class BaseComponent(BaseHealthCheck, BaseStartCheck, ABC):
    @abstractmethod
    async def startup(self, registry: ComponentRegistry) -> None:
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        pass
