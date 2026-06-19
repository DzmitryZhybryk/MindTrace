"""Unit-тесты value object ``ApproximateDate`` — сборка из частей, нормализация, валидация."""

import datetime as dt

import pytest

from app.journeys.domain.enums import DatePrecision
from app.journeys.domain.value_objects import ApproximateDate
from app.journeys.exceptions import InvalidJourneyDateError, JourneyDateInFutureError


@pytest.mark.parametrize(
    ("year", "month", "day", "expected_value", "expected_precision"),
    [
        (2020, None, None, dt.date(2020, 1, 1), DatePrecision.YEAR),
        (2020, 6, None, dt.date(2020, 6, 1), DatePrecision.MONTH),
        (2020, 6, 15, dt.date(2020, 6, 15), DatePrecision.DAY),
    ],
)
def test_from_parts_normalizes_value_and_derives_precision(
    year: int,
    month: int | None,
    day: int | None,
    expected_value: dt.date,
    expected_precision: DatePrecision,
) -> None:
    """from_parts: точность выводится из заполненности, недостающий разряд забивается 1-м числом."""
    approximate_date = ApproximateDate.from_parts(year=year, month=month, day=day)

    assert approximate_date.value == expected_value
    assert approximate_date.precision is expected_precision


def test_from_parts_day_without_month_raises_invalid_date() -> None:
    """from_parts: день без месяца невозможен по построению → InvalidJourneyDateError."""
    with pytest.raises(InvalidJourneyDateError):
        ApproximateDate.from_parts(year=2020, day=15)


@pytest.mark.parametrize(
    ("year", "month", "day"),
    [
        (2021, 2, 30),  # 30 февраля не существует
        (2020, 13, 1),  # месяц вне 1..12
        (2020, 4, 31),  # 31 апреля не существует
    ],
)
def test_from_parts_nonexistent_date_raises_invalid_date(year: int, month: int, day: int | None) -> None:
    """from_parts: несуществующая календарная дата → InvalidJourneyDateError."""
    with pytest.raises(InvalidJourneyDateError):
        ApproximateDate.from_parts(year=year, month=month, day=day)


def test_from_parts_future_year_raises() -> None:
    """from_parts: год больше текущего (будущее = wishlist) → JourneyDateInFutureError."""
    future_year = dt.datetime.now(tz=dt.UTC).year + 1

    with pytest.raises(JourneyDateInFutureError):
        ApproximateDate.from_parts(year=future_year)


def test_from_parts_current_year_is_allowed() -> None:
    """from_parts: текущий год — граница «не будущее», принимается."""
    current_year = dt.datetime.now(tz=dt.UTC).year

    approximate_date = ApproximateDate.from_parts(year=current_year)

    assert approximate_date.value == dt.date(current_year, 1, 1)
    assert approximate_date.precision is DatePrecision.YEAR
