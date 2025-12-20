from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from fastapi import FastAPI
from pydantic import BaseModel

if TYPE_CHECKING:
    from app.infra.components.base import BaseComponent


class BFastAPI(FastAPI):
    components: Sequence[BaseComponent]


class BaseCheckReport(BaseModel):
    component_name: str
    error: str | None = None


class BaseCheckResponse(BaseModel):
    status: str
    reports: list[BaseCheckReport]
