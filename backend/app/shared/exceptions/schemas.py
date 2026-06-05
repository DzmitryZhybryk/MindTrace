"""Схемы для ответов ошибок API."""

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field

from app.shared.types import OptionalDict


class ErrorResponse(BaseModel):
    """
    Базовая схема ответа ошибки API.

    Используется для всех типов ошибок и автоматически генерирует документацию OpenAPI.
    """

    code: str = Field(
        ...,
        description="Код ошибки для программной обработки",
        examples=["invalid_input", "not_found", "internal"],
    )
    message: str = Field(
        ...,
        description="Человекочитаемое сообщение об ошибке",
        examples=["Некорректный запрос", "Ресурс не найден"],
    )
    details: OptionalDict = Field(
        default=None,
        description="Дополнительные детали ошибки (опционально)",
        examples=[{"field": "email", "reason": "Invalid email format"}],
    )
    timestamp: dt.datetime = Field(
        default_factory=lambda: dt.datetime.now(dt.UTC),
        description="Временная метка возникновения ошибки (UTC)",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "invalid_input",
                "message": "Некорректный запрос",
                "details": None,
                "timestamp": "2024-01-01T12:00:00Z",
            }
        }
    )
