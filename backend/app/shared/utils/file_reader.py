import tomllib
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, ClassVar

from app.shared.logging import get_logger
from app.shared.types import DictStrAny
from app.shared.utils.utils_exceptions import UnsupportedFileTypeError

logger = get_logger(__name__)


class BaseFileReader[T](ABC):
    """Base class for file readers."""

    @abstractmethod
    def read(self, file_path: Path) -> T:
        """Read file and return its contents."""
        raise NotImplementedError


class TomlFileReader(BaseFileReader[DictStrAny]):
    """Reads a TOML file and returns its contents as a dictionary."""

    def read(self, file_path: Path) -> DictStrAny:
        """Read TOML file and return dictionary."""
        try:
            with file_path.open("rb") as f:
                return tomllib.load(f)
        except FileNotFoundError:
            logger.warning("file_reader.file_not_found", file_path=str(file_path))
            raise
        except tomllib.TOMLDecodeError as exc:
            logger.exception("file_reader.toml_decode_error", file_path=str(file_path), error=str(exc))
            raise


class FileReaderFactory:
    """Factory for creating file readers based on file type or explicit reader class."""

    _readers: ClassVar[dict[str, type[BaseFileReader[Any]]]] = {
        ".toml": TomlFileReader,
    }

    @classmethod
    def create_for_file(cls, file_path: Path) -> BaseFileReader[Any]:
        """Create appropriate reader based on file extension."""
        suffix = file_path.suffix.lower()
        reader_class = cls._readers.get(suffix)
        if reader_class is None:
            raise UnsupportedFileTypeError(message=f"Неподдерживаемый тип файла: {suffix}")

        return reader_class()


def read_file(file_path: Path) -> Any:
    """Convenience function to read a file using appropriate reader."""
    reader = FileReaderFactory.create_for_file(file_path=file_path)
    return reader.read(file_path=file_path)
