"""Middleware для приложения."""

from app.shared.middlewares.http_logging import HTTPLoggingMiddleware

__all__ = [
    "HTTPLoggingMiddleware",
]
