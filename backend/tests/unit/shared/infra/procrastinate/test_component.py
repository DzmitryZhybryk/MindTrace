"""
Unit-тест ``ProcrastinateComponent.startup`` при недоступной базе.

Коннектор procrastinate присваивает себе пул до ожидания первых соединений, поэтому упавший
старт оставил бы созданный пул открытым. Сеть не нужна: подменяется только внешний слой —
открытие пула psycopg падает так же, как при недоступной базе, а закрытие пула записывается.
"""

import psycopg_pool
import pytest
from pydantic import SecretStr

from app.shared.infra.di.registry import ComponentRegistry
from app.shared.infra.procrastinate.component import ProcrastinateApp, ProcrastinateComponent
from app.shared.settings import ProcrastinateSettings


async def test_startup_failed_pool_open_closes_pool_and_registers_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Пул не открылся: startup пробрасывает ошибку, созданный пул закрыт, ``ProcrastinateApp`` в реестр не попал."""
    closed_pools: list[psycopg_pool.AsyncConnectionPool] = []
    original_close = psycopg_pool.AsyncConnectionPool.close

    async def failing_open(self: psycopg_pool.AsyncConnectionPool, **_kwargs: object) -> None:
        raise psycopg_pool.PoolTimeout

    async def recording_close(self: psycopg_pool.AsyncConnectionPool) -> None:
        closed_pools.append(self)
        await original_close(self)

    monkeypatch.setattr(psycopg_pool.AsyncConnectionPool, "open", failing_open)
    monkeypatch.setattr(psycopg_pool.AsyncConnectionPool, "close", recording_close)
    component = ProcrastinateComponent(
        settings=ProcrastinateSettings(POSTGRES_USER="user", POSTGRES_PASSWORD=SecretStr("pw"), POSTGRES_DB="db"),
    )
    registry = ComponentRegistry()

    with pytest.raises(psycopg_pool.PoolTimeout):
        await component.startup(registry)

    assert len(closed_pools) == 1
    assert ProcrastinateApp not in registry
