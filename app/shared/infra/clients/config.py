from dataclasses import dataclass, field

from app.shared.types import DictStrAny


@dataclass(frozen=True, slots=True)
class HTTPClientConfig:
    """
    Конфигурация одного внешнего HTTP-клиента.

    Транспортный объект без семантической валидации — по правилу из CLAUDE.md
    идёт как dataclass.
    """

    base_url: str
    timeout: float = 10.0
    headers: DictStrAny = field(default_factory=dict)
    max_connections: int = 100
    max_keepalive_connections: int = 20
