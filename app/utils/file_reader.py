from abc import ABC, abstractmethod
from typing import Any
from pathlib import Path
import tomllib


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
