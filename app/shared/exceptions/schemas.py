"""Схемы для ответов ошибок API."""

import datetime as dt
from typing import Any, ClassVar

from pydantic import BaseModel, Field

from app.shared.types import DictStrAny


class ErrorResponse(BaseModel):
    """
    Базовая схема ответа ошибки API.

    Используется для всех типов ошибок и автоматически генерирует документацию OpenAPI.
    """

    code: str = Field(
        ...,
        description="Код ошибки для программной обработки",
        examples=["bad_request", "not_found", "internal_server_error"],
    )
    message: str = Field(
        ...,
        description="Человекочитаемое сообщение об ошибке",
        examples=["Некорректный запрос", "Ресурс не найден"],
    )
    details: dict[str, Any] | None = Field(
        default=None,
        description="Дополнительные детали ошибки (опционально)",
        examples=[{"field": "email", "reason": "Invalid email format"}],
    )
    timestamp: dt.datetime = Field(
        default_factory=dt.datetime.now,
        description="Временная метка возникновения ошибки",
    )

    class Config:
        json_schema_extra: ClassVar[DictStrAny] = {
            "example": {
                "code": "bad_request",
                "message": "Некорректный запрос",
                "details": None,
                "timestamp": "2024-01-01T12:00:00",
            }
        }
