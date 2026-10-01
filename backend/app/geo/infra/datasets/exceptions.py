from collections.abc import Iterable

from app.geo.infra.datasets.manifest import DatasetSpec


class DatasetChecksumError(Exception):
    """Скачанный файл датасета не совпал с контрольной суммой из манифеста."""

    def __init__(self, *, spec: DatasetSpec, actual_sha256: str) -> None:
        super().__init__(
            f"Dataset {spec.name} {spec.version}: sha256 {actual_sha256} does not match manifest {spec.sha256}",
        )


class DatasetFormatError(Exception):
    """Файл датасета не соответствует формату из FORMAT.md."""


class DatasetColumnsError(DatasetFormatError):
    """Колонки файла не совпадают с форматом."""

    def __init__(self, *, columns: Iterable[str]) -> None:
        super().__init__(f"Unexpected dataset columns: {sorted(columns)}")


class UnknownVerdictPlaceError(Exception):
    """Вердикт арбитра ссылается на место, которого нет в датасете."""

    def __init__(self, *, external_id: str) -> None:
        super().__init__(f"Arbiter verdict references a place missing from the dataset: {external_id}")


class InvalidRuNameDecisionError(Exception):
    """Вердикт арбитра или строка файла решений не годится: пустое имя, неизвестный автор, повтор места."""

    def __init__(self, *, external_id: str, problem: str) -> None:
        super().__init__(f"Invalid ru name decision for {external_id}: {problem}")


class HumanDecisionOverrideError(Exception):
    """Вердикт арбитра пытается заменить решение, принятое человеком."""

    def __init__(self, *, external_id: str) -> None:
        super().__init__(f"Verdict for {external_id} would override a human decision; edit the decisions file instead")


class MissingEnglishNameError(DatasetFormatError):
    """У места нет имени на ``en`` — фолбэка отображения для любого языка."""

    def __init__(self, *, external_id: str) -> None:
        super().__init__(f"Place {external_id} has no English name")
