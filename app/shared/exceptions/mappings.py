"""Маппинг доменных исключений."""

from app.shared.exceptions import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServerError,
    TooManyRequestsError,
    UnauthorizedError,
    UnprocessableEntityError,
)

ExceptionMappingT = dict[type[Exception], tuple[int, str]]

# Маппинг доменных исключений в HTTP ответы (status_code, message)
# Базовые классы обрабатывают все дочерние исключения автоматически
DOMAIN_EXCEPTION_MAPPING: ExceptionMappingT = {
    # Базовые категории по HTTP кодам (обрабатывают все дочерние исключения)
    BadRequestError: (400, "Некорректный запрос"),
    UnauthorizedError: (401, "Требуется авторизация"),
    ForbiddenError: (403, "Доступ запрещен"),
    NotFoundError: (404, "Ресурс не найден"),
    ConflictError: (409, "Конфликт данных"),
    UnprocessableEntityError: (422, "Невозможно обработать запрос"),
    TooManyRequestsError: (429, "Превышен лимит запросов"),
    ServerError: (500, "Внутренняя ошибка сервера"),
    # Можно также регистрировать конкретные исключения для переопределения сообщений
    # ComponentNotRegisteredError: (500, "Компонент не зарегистрирован"),
    # Validation errors
    ValueError: (400, "Некорректные данные"),
}
