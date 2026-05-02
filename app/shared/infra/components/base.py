from abc import ABC, abstractmethod

from app.shared.infra.components.registry import ComponentRegistry


class BaseComponent(ABC):
    @abstractmethod
    async def startup(self, registry: ComponentRegistry) -> None:
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        pass
