from app.shared.exceptions import InternalError


class InvalidFractionalKeyError(InternalError):
    """Дробный ключ некорректен или границы для нового ключа переданы не по возрастанию."""

    code = "invalid_fractional_key"
    message = "Некорректный ключ порядка"
