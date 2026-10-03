"""Unit-тесты чтения манифеста датасетов."""

from pathlib import Path

from app.geo.infra.datasets.manifest import DatasetSpec, read_manifest


def test_read_manifest_returns_datasets_in_declared_order(tmp_path: Path) -> None:
    """read_manifest: каждая секция [[dataset]] → DatasetSpec, порядок как в файле."""
    manifest_path = tmp_path / "manifest.toml"
    manifest_path.write_text(
        """
[[dataset]]
name = "cities"
version = "v1"
url = "https://example.test/cities.csv.gz"
sha256 = "aaa"

[[dataset]]
name = "lakes"
version = "v2"
url = "https://example.test/lakes.csv.gz"
sha256 = "bbb"
""",
        encoding="utf-8",
    )

    datasets = read_manifest(path=manifest_path)

    assert datasets == (
        DatasetSpec(name="cities", version="v1", url="https://example.test/cities.csv.gz", sha256="aaa"),
        DatasetSpec(name="lakes", version="v2", url="https://example.test/lakes.csv.gz", sha256="bbb"),
    )


def test_read_manifest_default_path_reads_shipped_manifest() -> None:
    """read_manifest: манифест из репозитория читается и описывает хотя бы один датасет."""
    datasets = read_manifest()

    assert len(datasets) > 0
    assert all(len(dataset.sha256) == 64 for dataset in datasets)
