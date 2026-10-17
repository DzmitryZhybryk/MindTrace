import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Final

MANIFEST_PATH: Final[Path] = Path(__file__).with_name("manifest.toml")


@dataclass(frozen=True, slots=True)
class DatasetSpec:
    """Датасет газеттира из манифеста: что загрузить, откуда и как проверить целостность файла."""

    name: str
    version: str
    url: str
    sha256: str


def read_manifest(*, path: Path = MANIFEST_PATH) -> tuple[DatasetSpec, ...]:
    """
    Читает манифест датасетов.

    Args:
        path: Путь к TOML-манифесту (по умолчанию — ``manifest.toml`` рядом с модулем)

    Returns:
        Датасеты в порядке объявления
    """
    with path.open("rb") as manifest_file:
        manifest = tomllib.load(manifest_file)

    return tuple(
        DatasetSpec(
            name=dataset["name"],
            version=dataset["version"],
            url=dataset["url"],
            sha256=dataset["sha256"],
        )
        for dataset in manifest["dataset"]
    )
