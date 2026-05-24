"""Исключения для компонентов инфраструктуры."""

from app.shared.exceptions.base import InternalError


class ComponentNotRegisteredError(InternalError):
    """
    Исключение, возникающее когда компонент не зарегистрирован в ComponentRegistry.

    Используется для ошибок конфигурации инфраструктуры (например, компонент не был зарегистрирован).
    Это внутренняя ошибка сервера (HTTP 500), а не ошибка клиента.
    """

    code = "component_not_registered"
    message = "Компонент не зарегистрирован"
