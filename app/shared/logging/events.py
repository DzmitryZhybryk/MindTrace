"""Утилиты для преобразования HTTP запросов в семантические названия событий."""

EVENT_MAPPER: dict[tuple[str, str], str] = {
    # Пути в маппере должны быть без trailing slash (нормализованные)
    ("POST", "/v1/auth/register"): "User registration",
    ("POST", "/v1/auth/login"): "User login",
    ("POST", "/v1/auth/logout"): "User logout",
    ("POST", "/v1/auth/refresh"): "Refresh access token",
    ("POST", "/v1/auth/email/send-verification"): "Send email verification",
    ("POST", "/v1/auth/email/verify"): "Verify email",
}


def get_event_name(method: str, path: str) -> str:
    """
    Получает семантическое название события на основе method и path.

    Args:
        method: HTTP метод (GET, POST, PUT, DELETE и т.д.)
        path: Путь запроса (например, "/v1/users/register/")

    Returns:
        Семантическое название события или fallback на "method path"
    """
    # Нормализуем path (убираем trailing slash для сравнения)
    normalized_path = path.rstrip("/") or "/"

    # Ищем точное совпадение
    event = EVENT_MAPPER.get((method, normalized_path))
    if event:
        return event

    # Fallback: возвращаем сообщение о том, что нет соответствующего события
    return f"Неизвестное событие для: ({method}, {path})"
