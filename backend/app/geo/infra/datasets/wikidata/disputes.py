import csv
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from app.geo.infra.datasets.exceptions import UnknownVerdictPlaceError
from app.geo.infra.datasets.wikidata.labels import acceptable_ru_names, geonames_id_of

DECISIONS_PATH: Final[Path] = Path(__file__).parents[1] / "ru_name_decisions.csv"

DECISION_COLUMNS: Final[tuple[str, ...]] = (
    "external_id",
    "geonames_ru",
    "wikidata_ru",
    "name_ru",
    "decided_by",
    "reason",
)

# Несколько меток Wikidata в одной ячейке файла решений.
_LABELS_SEPARATOR: Final[str] = " | "

_SPACES_AND_DASHES: Final[re.Pattern[str]] = re.compile(r"[\s\-‐–—]+")


@dataclass(frozen=True, slots=True)
class RuNameDispute:
    """Место, у которого русское имя GeoNames расходится с меткой Wikidata."""

    external_id: str
    name_en: str
    country_code: str
    population: str
    geonames_ru: str
    wikidata_ru: frozenset[str]


@dataclass(frozen=True, slots=True)
class RuNameDecision:
    """Решение арбитра по спору: какое русское имя показывать и почему."""

    external_id: str
    geonames_ru: str
    wikidata_ru: frozenset[str]
    name_ru: str
    decided_by: str
    reason: str


@dataclass(frozen=True, slots=True)
class DisputesReport:
    """Итог применения решений: сколько споров нашлось, сколько решено и сколько имён исправлено без спора."""

    disputes: int
    resolved: int
    unresolved: int
    corrected: int


def find_disputes(
    *,
    rows: Iterable[Mapping[str, str]],
    labels: Mapping[str, frozenset[str]],
) -> list[RuNameDispute]:
    """
    Находит места, где русское имя GeoNames и метка Wikidata расходятся по существу.

    Различия только в «ё»/«е», дефисах, пробелах и регистре спором не считаются.

    Args:
        rows: Строки файла датасета
        labels: Метки Wikidata по id GeoNames

    Returns:
        Споры в порядке строк
    """
    disputes: list[RuNameDispute] = []
    for row in rows:
        geonames_id = geonames_id_of(external_id=row["external_id"])
        if not row["name_ru"] or geonames_id is None:
            continue

        names = acceptable_ru_names(labels=labels.get(geonames_id, frozenset()))
        if not names or any(_same_name(left=row["name_ru"], right=name) for name in names):
            continue

        disputes.append(
            RuNameDispute(
                external_id=row["external_id"],
                name_en=row["name_en"],
                country_code=row["country_code"],
                population=row["population"],
                geonames_ru=row["name_ru"],
                wikidata_ru=names,
            ),
        )

    return disputes


def apply_decisions(
    *,
    rows: Iterable[Mapping[str, str]],
    disputes: Iterable[RuNameDispute],
    decisions: Mapping[str, RuNameDecision],
) -> tuple[list[dict[str, str]], list[RuNameDispute], DisputesReport]:
    """
    Подставляет имена по решениям арбитра; спор без актуального решения сохраняет имя GeoNames.

    Решение актуально, только если записано для тех же имён, что спорят сейчас: изменилось имя в
    GeoNames или метки Wikidata — решение устарело, и спор уходит на повторный арбитраж. Решение
    без меток Wikidata — ручная правка сломанного имени GeoNames, у которого спорить не с чем: оно
    действует, пока в GeoNames то же имя и спора по месту нет.

    Args:
        rows: Строки файла датасета
        disputes: Споры этих строк (см. ``find_disputes``)
        decisions: Решения по ``external_id``

    Returns:
        Строки в исходном порядке, споры без актуального решения и итог
    """
    names_by_id: dict[str, str] = {}
    unresolved: list[RuNameDispute] = []
    disputed_ids: set[str] = set()
    for dispute in disputes:
        disputed_ids.add(dispute.external_id)
        decision = decisions.get(dispute.external_id)
        if (
            decision is not None
            and decision.geonames_ru == dispute.geonames_ru
            and decision.wikidata_ru == dispute.wikidata_ru
        ):
            names_by_id[dispute.external_id] = decision.name_ru
        else:
            unresolved.append(dispute)

    resolved = len(names_by_id)
    result: list[dict[str, str]] = []
    for row in rows:
        new_row = dict(row)
        external_id = row["external_id"]
        decision = decisions.get(external_id)
        if (
            external_id not in disputed_ids
            and decision is not None
            and not decision.wikidata_ru
            and decision.geonames_ru == row["name_ru"]
        ):
            names_by_id[external_id] = decision.name_ru

        name = names_by_id.get(external_id)
        if name is not None:
            new_row["name_ru"] = name

        result.append(new_row)

    report = DisputesReport(
        disputes=len(disputed_ids),
        resolved=resolved,
        unresolved=len(unresolved),
        corrected=len(names_by_id) - resolved,
    )
    return result, unresolved, report


@dataclass(frozen=True, slots=True)
class ArbiterVerdict:
    """Вердикт арбитра по месту: какое русское имя показывать, кто решил и почему."""

    external_id: str
    name_ru: str
    decided_by: str
    reason: str


def record_verdicts(
    *,
    verdicts: Iterable[ArbiterVerdict],
    rows: Iterable[Mapping[str, str]],
    disputes: Iterable[RuNameDispute],
) -> list[RuNameDecision]:
    """
    Превращает вердикты арбитра в решения, фиксируя имена, о которых шла речь.

    Для места в споре решение запоминает оба спорящих имени; для места без спора — правка
    сломанного имени GeoNames — только его, с пустыми метками Wikidata.

    Args:
        verdicts: Вердикты арбитра
        rows: Строки файла датасета
        disputes: Текущие споры этих строк

    Returns:
        Решения в порядке вердиктов

    Raises:
        UnknownVerdictPlaceError: вердикт ссылается на место, которого нет в датасете
    """
    disputes_by_id = {dispute.external_id: dispute for dispute in disputes}
    names_by_id = {row["external_id"]: row["name_ru"] for row in rows}
    decisions: list[RuNameDecision] = []
    for verdict in verdicts:
        dispute = disputes_by_id.get(verdict.external_id)
        if dispute is not None:
            geonames_ru, wikidata_ru = dispute.geonames_ru, dispute.wikidata_ru
        elif verdict.external_id in names_by_id:
            geonames_ru, wikidata_ru = names_by_id[verdict.external_id], frozenset[str]()
        else:
            raise UnknownVerdictPlaceError(external_id=verdict.external_id)

        decisions.append(
            RuNameDecision(
                external_id=verdict.external_id,
                geonames_ru=geonames_ru,
                wikidata_ru=wikidata_ru,
                name_ru=verdict.name_ru,
                decided_by=verdict.decided_by,
                reason=verdict.reason,
            ),
        )

    return decisions


def read_decisions(*, path: Path = DECISIONS_PATH) -> dict[str, RuNameDecision]:
    """
    Читает файл решений арбитра.

    Args:
        path: Путь к CSV (по умолчанию — ``ru_name_decisions.csv`` рядом с манифестом)

    Returns:
        Решения по ``external_id``
    """
    with path.open(encoding="utf-8", newline="") as decisions_file:
        return {
            row["external_id"]: RuNameDecision(
                external_id=row["external_id"],
                geonames_ru=row["geonames_ru"],
                wikidata_ru=frozenset(row["wikidata_ru"].split(_LABELS_SEPARATOR))
                if row["wikidata_ru"]
                else frozenset(),
                name_ru=row["name_ru"],
                decided_by=row["decided_by"],
                reason=row["reason"],
            )
            for row in csv.DictReader(decisions_file)
        }


def write_decisions(*, decisions: Iterable[RuNameDecision], path: Path = DECISIONS_PATH) -> None:
    """
    Пишет файл решений арбитра, отсортированный по ``external_id`` — чтобы дифф показывал только правки.

    Args:
        decisions: Решения
        path: Путь к CSV
    """
    with path.open("w", encoding="utf-8", newline="") as decisions_file:
        writer = csv.DictWriter(decisions_file, fieldnames=DECISION_COLUMNS, lineterminator="\n")
        writer.writeheader()
        for decision in sorted(decisions, key=lambda item: item.external_id):
            writer.writerow(
                {
                    "external_id": decision.external_id,
                    "geonames_ru": decision.geonames_ru,
                    "wikidata_ru": _LABELS_SEPARATOR.join(sorted(decision.wikidata_ru)),
                    "name_ru": decision.name_ru,
                    "decided_by": decision.decided_by,
                    "reason": decision.reason,
                },
            )


def _same_name(*, left: str, right: str) -> bool:
    """Одно ли это имя с точностью до «ё»/«е», дефисов, пробелов и регистра."""
    return _normalize(name=left) == _normalize(name=right)


def _normalize(*, name: str) -> str:
    return _SPACES_AND_DASHES.sub(" ", name.replace("ё", "е").replace("Ё", "Е")).strip().lower()
