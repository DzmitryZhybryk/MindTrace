"""Исключения для утилит."""

from app.shared.exceptions.base import ServerError


class UnsupportedFileTypeError(ServerError):
    """Raised when file type is not supported."""

    code = "unsupported_file_type"
    message = "Неподдерживаемый тип файла для чтения"
