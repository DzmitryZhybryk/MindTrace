"""Утилиты для преобразования HTTP-запросов в семантические названия событий."""

from starlette.requests import Request
from starlette.routing import Match


def get_event_name(request: Request) -> str:
    """
    Выводит семантическое название события из имени совпавшего роута.

    Имя роута (``route.name`` — по умолчанию имя функции-обработчика) принадлежит
    домену, который роут объявил, поэтому shared-логирование не хранит маппинг
    доменных путей. ``BaseHTTPMiddleware`` не пробрасывает ``scope["route"]``
    обратно в middleware, поэтому совпавший роут переподбирается вручную по
    ``request.app.routes``.

    Args:
        request: HTTP-запрос (уже прошедший роутинг)

    Returns:
        Гуманизированное имя события (``send_email_verification`` →
        ``"Send email verification"``) либо fallback ``"{method} {path}"``,
        если ни один роут не совпал (например, 404).
    """
    for route in request.app.routes:
        match, _ = route.matches(request.scope)
        if match == Match.FULL:
            name = getattr(route, "name", None)
            if name:
                return name.replace("_", " ").capitalize()

            break

    return f"{request.method} {request.url.path}"
