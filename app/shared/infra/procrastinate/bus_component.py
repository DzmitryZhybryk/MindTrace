"""
TaskBusComponent — lifecycle-обёртка над ``TaskBus``.

На startup читает ``ProcrastinateApp`` из registry и регистрирует ``TaskBus``.
Регистрируется **после** ``ProcrastinateComponent`` в композиции компонентов —
иначе на startup'е ``ProcrastinateApp`` ещё не будет в registry.

shutdown — no-op: ``TaskBus`` собственным сетевым ресурсом не владеет, коннекшен
закрывает ``ProcrastinateComponent.shutdown``.
"""

from app.shared.infra.di.base import BaseComponent
from app.shared.infra.di.registry import ComponentRegistry
from app.shared.infra.procrastinate.bus import TaskBus
from app.shared.infra.procrastinate.component import ProcrastinateApp


class TaskBusComponent(BaseComponent):
    async def startup(self, registry: ComponentRegistry) -> None:
        app = registry.get(ProcrastinateApp)
        registry.set(TaskBus, TaskBus(app=app))

    async def shutdown(self) -> None:
        pass
