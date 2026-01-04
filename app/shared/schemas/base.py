from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from fastapi import FastAPI
from pydantic import BaseModel

if TYPE_CHECKING:
    from app.shared.infra.components.base import BaseComponent
    from app.shared.infra.components.registry import ComponentRegistry


class BFastAPI(FastAPI):
    components: Sequence[BaseComponent]
    registry: ComponentRegistry


class BaseCheckReport(BaseModel):
    component_name: str
    error: str | None = None


class BaseCheckResponse(BaseModel):
    status: str
    reports: list[BaseCheckReport]
