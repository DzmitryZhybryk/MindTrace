import tomllib
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, ClassVar, TypeVar

T = TypeVar("T")


class BaseFileReader[T](ABC):
    """Base class for file readers."""

    @abstractmethod
    def read(self, file_path: Path) -> T:
        """Read file and return its contents."""
        raise NotImplementedError


class TomlFileReader(BaseFileReader[dict[str, Any]]):
    """Reads a TOML file and returns its contents as a dictionary."""

    def read(self, file_path: Path) -> dict[str, Any]:
        """Read TOML file and return dictionary."""
        try:
            with file_path.open("rb") as f:
                return tomllib.load(f)
        except (FileNotFoundError, tomllib.TOMLDecodeError):
            return {}


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
            # TODO: add logging and custom exception
            raise ValueError(f"Unsupported file type: {suffix}")

        return reader_class()


def read_file(file_path: Path) -> Any:
    """Convenience function to read a file using appropriate reader."""
    reader = FileReaderFactory.create_for_file(file_path=file_path)
    return reader.read(file_path=file_path)
