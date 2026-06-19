import datetime as dt
from typing import Self

from app.journeys.domain.enums import DatePrecision
from app.journeys.exceptions import InvalidJourneyDateError, JourneyDateInFutureError


class ApproximateDate:
    """
    Приблизительная дата поездки: нормализованная дата + её точность — value object.

    Год обязателен, месяц и день опциональны. Хранится нормализованным ``date``
    (разряды ниже точности забиты 1-м: ``year``→YYYY-01-01, ``month``→YYYY-MM-01)
    плюс ``precision``. Голый ``date`` без точности потерял бы «только год» против
    «точно 1 января», поэтому держим пару (date, precision).
    """

    def __init__(self, *, value: dt.date, precision: DatePrecision) -> None:
        self._value = value
        self._precision = precision

    @property
    def value(self) -> dt.date:
        return self._value

    @property
    def precision(self) -> DatePrecision:
        return self._precision

    @classmethod
    def from_parts(cls, *, year: int, month: int | None = None, day: int | None = None) -> Self:
        """
        Собирает дату из частей (год обяз., месяц/день опц.), нормализует и валидирует.

        Точность выводится из заполненности: день→``DAY``, месяц→``MONTH``, иначе ``YEAR``.
        Дата нормализуется до 1-го числа недостающего разряда. Год не может быть в
        будущем (будущее = wishlist, вне скоупа).

        Args:
            year: Год поездки (обязателен)
            month: Месяц 1..12 либо ``None``
            day: День месяца либо ``None`` (требует ``month``)

        Returns:
            Нормализованная приблизительная дата

        Raises:
            InvalidJourneyDateError: день без месяца либо несуществующая дата (например 30 февраля)
            JourneyDateInFutureError: год больше текущего
        """
        if day is not None and month is None:
            raise InvalidJourneyDateError()

        if day is not None:
            precision = DatePrecision.DAY
        elif month is not None:
            precision = DatePrecision.MONTH
        else:
            precision = DatePrecision.YEAR

        try:
            value = dt.date(year=year, month=month or 1, day=day or 1)
        except ValueError as exc:
            raise InvalidJourneyDateError() from exc

        if year > dt.datetime.now(tz=dt.UTC).year:
            raise JourneyDateInFutureError()

        return cls(value=value, precision=precision)
