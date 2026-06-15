import { Checkbox, Select, Stack, Text } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useTranslation } from "react-i18next";

import type { JourneyFormValues } from "./JourneyForm";

const YEARS_BACK = 100;
const DEFAULT_LEAP_YEAR = 2000;

/** Число дней в месяце (1..12) с учётом високосного года. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Название месяца в активной локали с заглавной буквы (без хардкода в i18n). */
function monthLabel(monthIndex: number, locale: string): string {
  const name = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2020, monthIndex, 1));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface JourneyDateFieldProps {
  form: UseFormReturnType<JourneyFormValues>;
}

/**
 * Контрол приблизительной даты с прогрессивным уточнением: год обязателен,
 * месяц и день раскрываются по желанию (день — только после месяца). Точность
 * (year/month/day) бэк выводит из заполненности; день валидируется по месяцу/году.
 */
export function JourneyDateField({ form }: JourneyDateFieldProps) {
  const { t, i18n } = useTranslation("journeys");
  const values = form.getValues();

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: YEARS_BACK + 1 }, (_, i) => String(currentYear - i));
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: monthLabel(i, i18n.language),
  }));

  const selectedYear = values.year ? Number(values.year) : DEFAULT_LEAP_YEAR;
  const selectedMonth = values.month ? Number(values.month) : null;
  const dayCount = selectedMonth ? daysInMonth(selectedYear, selectedMonth) : 31;
  const dayOptions = Array.from({ length: dayCount }, (_, i) => String(i + 1));

  // Сброс невалидного дня при смене месяца/года (31 → апрель, 29 → невисокосный февраль).
  const clampDay = (year: number, month: number | null) => {
    const day = form.getValues().day;
    if (month && day && Number(day) > daysInMonth(year, month)) {
      form.setFieldValue("day", null);
    }
  };

  const handleYearChange = (value: string | null) => {
    form.setFieldValue("year", value);
    form.clearFieldError("year");
    clampDay(value ? Number(value) : DEFAULT_LEAP_YEAR, selectedMonth);
  };

  const handleMonthChange = (value: string | null) => {
    form.setFieldValue("month", value);
    form.clearFieldError("month");
    clampDay(selectedYear, value ? Number(value) : null);
  };

  const handleHasMonthChange = (checked: boolean) => {
    if (checked) {
      form.setFieldValue("hasMonth", true);
    } else {
      form.setValues({ hasMonth: false, month: null, hasDay: false, day: null });
      form.clearFieldError("month");
      form.clearFieldError("day");
    }
  };

  const handleHasDayChange = (checked: boolean) => {
    if (checked) {
      form.setFieldValue("hasDay", true);
    } else {
      form.setValues({ hasDay: false, day: null });
      form.clearFieldError("day");
    }
  };

  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>
        {t("addJourney.date.legend")}
      </Text>

      <Select
        placeholder={t("addJourney.date.yearPlaceholder")}
        size="md"
        radius="md"
        searchable
        data={yearOptions}
        value={values.year}
        onChange={handleYearChange}
        error={form.errors.year}
      />

      <Checkbox
        label={t("addJourney.date.addMonth")}
        checked={values.hasMonth}
        onChange={(event) => handleHasMonthChange(event.currentTarget.checked)}
      />

      {values.hasMonth && (
        <Select
          placeholder={t("addJourney.date.monthPlaceholder")}
          size="md"
          radius="md"
          data={monthOptions}
          value={values.month}
          onChange={handleMonthChange}
          error={form.errors.month}
        />
      )}

      <Checkbox
        label={t("addJourney.date.addDay")}
        checked={values.hasDay}
        disabled={!values.hasMonth}
        onChange={(event) => handleHasDayChange(event.currentTarget.checked)}
      />

      {values.hasMonth && values.hasDay && (
        <Select
          placeholder={t("addJourney.date.dayPlaceholder")}
          size="md"
          radius="md"
          searchable
          disabled={!values.month}
          data={dayOptions}
          value={values.day}
          onChange={(value) => {
            form.setFieldValue("day", value);
            form.clearFieldError("day");
          }}
          error={form.errors.day}
        />
      )}
    </Stack>
  );
}
