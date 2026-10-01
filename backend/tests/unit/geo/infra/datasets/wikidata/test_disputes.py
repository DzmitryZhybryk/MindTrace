"""Unit-тесты споров русских имён GeoNames и Wikidata и применения решений арбитра."""

from pathlib import Path

import pytest

from app.geo.infra.datasets.exceptions import UnknownVerdictPlaceError
from app.geo.infra.datasets.wikidata.disputes import (
    ArbiterVerdict,
    DisputesReport,
    RuNameDecision,
    RuNameDispute,
    apply_decisions,
    find_disputes,
    read_decisions,
    record_verdicts,
    write_decisions,
)

_HUANGSHAN_ROW = {
    "external_id": "GeoNames:1792359",
    "name_en": "Huangshan City",
    "name_ru": "Туньси",
    "country_code": "CN",
    "population": "460786",
}

_HUANGSHAN_DISPUTE = RuNameDispute(
    external_id="GeoNames:1792359",
    name_en="Huangshan City",
    country_code="CN",
    population="460786",
    geonames_ru="Туньси",
    wikidata_ru=frozenset({"Хуаншань"}),
)


def test_find_disputes_reports_different_names() -> None:
    """find_disputes: имя GeoNames и метка Wikidata разные → спор с обоими вариантами."""
    disputes = find_disputes(rows=[_HUANGSHAN_ROW], labels={"1792359": frozenset({"Хуаншань"})})

    assert disputes == [_HUANGSHAN_DISPUTE]


@pytest.mark.parametrize(
    "label",
    ["Туньси", "туньси", "Туньси (город)"],
    ids=["same", "case", "qualifier"],
)
def test_find_disputes_ignores_same_name(label: str) -> None:
    """find_disputes: совпадение с точностью до регистра и уточнения в скобках — не спор."""
    assert find_disputes(rows=[_HUANGSHAN_ROW], labels={"1792359": frozenset({label})}) == []


@pytest.mark.parametrize(
    ("geonames_ru", "label"),
    [("Гёйчай", "Гейчай"), ("Самдруп-Джонгхар", "Самдруп Джонгхар")],
    ids=["yo", "hyphen"],
)
def test_find_disputes_ignores_yo_and_hyphen_differences(geonames_ru: str, label: str) -> None:
    """find_disputes: «ё»/«е» и дефис вместо пробела — то же имя, не спор."""
    row = {**_HUANGSHAN_ROW, "name_ru": geonames_ru}

    assert find_disputes(rows=[row], labels={"1792359": frozenset({label})}) == []


@pytest.mark.parametrize(
    ("row", "labels"),
    [
        ({**_HUANGSHAN_ROW, "name_ru": ""}, {"1792359": frozenset({"Хуаншань"})}),
        ({**_HUANGSHAN_ROW, "external_id": "OSM:1"}, {"1792359": frozenset({"Хуаншань"})}),
        (_HUANGSHAN_ROW, {}),
        (_HUANGSHAN_ROW, {"1792359": frozenset({"Huangshan"})}),
    ],
    ids=["no-geonames-name", "not-geonames", "no-wikidata-label", "only-unacceptable-label"],
)
def test_find_disputes_needs_both_names(row: dict[str, str], labels: dict[str, frozenset[str]]) -> None:
    """find_disputes: спор только когда есть и имя GeoNames, и годная метка Wikidata."""
    assert find_disputes(rows=[row], labels=labels) == []


def test_apply_decisions_uses_current_decision() -> None:
    """apply_decisions: решение записано для тех же имён → имя из решения, спор решён."""
    decision = RuNameDecision(
        external_id="GeoNames:1792359",
        geonames_ru="Туньси",
        wikidata_ru=frozenset({"Хуаншань"}),
        name_ru="Хуаншань",
        decided_by="llm",
        reason="Tunxi is the central district",
    )

    rows, unresolved, report = apply_decisions(
        rows=[_HUANGSHAN_ROW],
        disputes=[_HUANGSHAN_DISPUTE],
        decisions={decision.external_id: decision},
    )

    assert rows[0]["name_ru"] == "Хуаншань"
    assert unresolved == []
    assert report == DisputesReport(disputes=1, resolved=1, unresolved=0, corrected=0)


@pytest.mark.parametrize(
    ("geonames_ru", "wikidata_ru"),
    [("Тунси", frozenset({"Хуаншань"})), ("Туньси", frozenset({"Хуаншаньши"}))],
    ids=["geonames-changed", "wikidata-changed"],
)
def test_apply_decisions_ignores_stale_decision(geonames_ru: str, wikidata_ru: frozenset[str]) -> None:
    """apply_decisions: решение записано для других имён → устарело, имя GeoNames, спор не решён."""
    decision = RuNameDecision(
        external_id="GeoNames:1792359",
        geonames_ru=geonames_ru,
        wikidata_ru=wikidata_ru,
        name_ru="Хуаншань",
        decided_by="llm",
        reason="stale",
    )

    rows, unresolved, report = apply_decisions(
        rows=[_HUANGSHAN_ROW],
        disputes=[_HUANGSHAN_DISPUTE],
        decisions={decision.external_id: decision},
    )

    assert rows[0]["name_ru"] == "Туньси"
    assert unresolved == [_HUANGSHAN_DISPUTE]
    assert report == DisputesReport(disputes=1, resolved=0, unresolved=1, corrected=0)


def test_apply_decisions_without_decision_keeps_geonames_name() -> None:
    """apply_decisions: решения нет → имя GeoNames, спор уходит на арбитраж."""
    rows, unresolved, _ = apply_decisions(rows=[_HUANGSHAN_ROW], disputes=[_HUANGSHAN_DISPUTE], decisions={})

    assert rows[0]["name_ru"] == "Туньси"
    assert unresolved == [_HUANGSHAN_DISPUTE]


def test_apply_decisions_corrects_broken_name_without_dispute() -> None:
    """apply_decisions: решение без меток Wikidata правит сломанное имя GeoNames, спора по месту нет."""
    row = {**_HUANGSHAN_ROW, "external_id": "GeoNames:2112297", "name_en": "Kamogawa", "name_ru": "Камогаwа"}
    decision = RuNameDecision(
        external_id="GeoNames:2112297",
        geonames_ru="Камогаwа",
        wikidata_ru=frozenset(),
        name_ru="Камогава",
        decided_by="llm",
        reason="Latin letter inside Cyrillic",
    )

    rows, unresolved, report = apply_decisions(rows=[row], disputes=[], decisions={decision.external_id: decision})

    assert rows[0]["name_ru"] == "Камогава"
    assert unresolved == []
    assert report == DisputesReport(disputes=0, resolved=0, unresolved=0, corrected=1)


@pytest.mark.parametrize(
    ("name_ru", "disputes"),
    [("Камогава-си", []), ("Камогаwа", [_HUANGSHAN_DISPUTE])],
    ids=["geonames-changed", "now-disputed"],
)
def test_apply_decisions_skips_correction_that_no_longer_fits(name_ru: str, disputes: list[RuNameDispute]) -> None:
    """apply_decisions: правка без спора не действует, если имя GeoNames сменилось или по месту появился спор."""
    row = {**_HUANGSHAN_ROW, "name_ru": name_ru}
    decision = RuNameDecision(
        external_id="GeoNames:1792359",
        geonames_ru="Камогаwа",
        wikidata_ru=frozenset(),
        name_ru="Камогава",
        decided_by="llm",
        reason="Latin letter inside Cyrillic",
    )

    rows, _, report = apply_decisions(rows=[row], disputes=disputes, decisions={decision.external_id: decision})

    assert rows[0]["name_ru"] == name_ru
    assert report.corrected == 0


def test_record_verdicts_captures_disputed_names() -> None:
    """record_verdicts: вердикт по спору запоминает оба спорящих имени — для проверки актуальности."""
    verdict = ArbiterVerdict(
        external_id="GeoNames:1792359",
        name_ru="Хуаншань",
        decided_by="llm",
        reason="Tunxi is the central district",
    )

    [decision] = record_verdicts(verdicts=[verdict], rows=[_HUANGSHAN_ROW], disputes=[_HUANGSHAN_DISPUTE])

    assert decision == RuNameDecision(
        external_id="GeoNames:1792359",
        geonames_ru="Туньси",
        wikidata_ru=frozenset({"Хуаншань"}),
        name_ru="Хуаншань",
        decided_by="llm",
        reason="Tunxi is the central district",
    )


def test_record_verdicts_without_dispute_is_correction() -> None:
    """record_verdicts: вердикт по месту без спора — правка имени GeoNames с пустыми метками Wikidata."""
    row = {**_HUANGSHAN_ROW, "external_id": "GeoNames:2112297", "name_ru": "Камогаwа"}
    verdict = ArbiterVerdict(external_id="GeoNames:2112297", name_ru="Камогава", decided_by="human", reason="typo")

    [decision] = record_verdicts(verdicts=[verdict], rows=[row], disputes=[])

    assert decision.geonames_ru == "Камогаwа"
    assert decision.wikidata_ru == frozenset()


def test_record_verdicts_unknown_place_raises() -> None:
    """record_verdicts: вердикт по месту, которого нет в датасете, — ошибка, а не молчаливый пропуск."""
    verdict = ArbiterVerdict(external_id="GeoNames:404", name_ru="Нигде", decided_by="llm", reason="-")

    with pytest.raises(UnknownVerdictPlaceError, match="GeoNames:404"):
        record_verdicts(verdicts=[verdict], rows=[_HUANGSHAN_ROW], disputes=[])


def test_decisions_file_roundtrip(tmp_path: Path) -> None:
    """write_decisions → read_decisions: решения переживают файл, несколько меток Wikidata — тоже."""
    path = tmp_path / "decisions.csv"
    decisions = [
        RuNameDecision(
            external_id="GeoNames:2",
            geonames_ru="Сёдермальм",
            wikidata_ru=frozenset({"Стокгольм", "Сёдермальм район"}),
            name_ru="Сёдермальм",
            decided_by="human",
            reason="district, not the city",
        ),
        RuNameDecision(
            external_id="GeoNames:1",
            geonames_ru="Туньси",
            wikidata_ru=frozenset({"Хуаншань"}),
            name_ru="Хуаншань",
            decided_by="llm",
            reason="Tunxi is the central district",
        ),
        RuNameDecision(
            external_id="GeoNames:3",
            geonames_ru="Камогаwа",
            wikidata_ru=frozenset(),
            name_ru="Камогава",
            decided_by="llm",
            reason="Latin letter inside Cyrillic",
        ),
    ]

    write_decisions(decisions=decisions, path=path)

    assert read_decisions(path=path) == {decision.external_id: decision for decision in decisions}
    assert [line.split(",")[0] for line in path.read_text(encoding="utf-8").splitlines()[1:]] == [
        "GeoNames:1",
        "GeoNames:2",
        "GeoNames:3",
    ]
