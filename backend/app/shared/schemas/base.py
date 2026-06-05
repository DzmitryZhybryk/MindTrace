from collections.abc import Sequence
from typing import TYPE_CHECKING

from fastapi import FastAPI

if TYPE_CHECKING:
    from app.shared.infra.di.base import BaseComponent
    from app.shared.infra.di.registry import ComponentRegistry


class BFastAPI(FastAPI):
    components: Sequence[BaseComponent]
    registry: ComponentRegistry
