import { useTranslation } from "react-i18next";

import { isYearInRange, toggleYear, type YearRange } from "./yearRange";

interface YearRangeChipsProps {
  /** Годы с поездками, по возрастанию. */
  years: readonly number[];
  range: YearRange | null;
  onRangeChange: (range: YearRange | null) => void;
}

/**
 * Чипы лет: один год или диапазон (нажать год, затем другой). «Все» снимает выбор.
 *
 * Границы диапазона залиты сильнее, годы внутри — слабее; для скринридера выбранность —
 * `aria-pressed`.
 */
export function YearRangeChips({ years, range, onRangeChange }: YearRangeChipsProps) {
  const { t } = useTranslation("journeys");

  return (
    <fieldset className="year-chips">
      <legend className="all-journeys__filter-label">{t("all.years")}</legend>
      <div className="year-chips__row">
        <button
          type="button"
          className="year-chip"
          aria-pressed={range === null}
          onClick={() => onRangeChange(null)}
        >
          {t("all.allYears")}
        </button>
        {years.map((year) => {
          const isSelected = range !== null && isYearInRange(range, year);
          const isEdge = range !== null && (year === range[0] || year === range[1]);
          const className = isEdge ? "year-chip year-chip--edge" : isSelected ? "year-chip year-chip--inside" : "year-chip";

          return (
            <button
              key={year}
              type="button"
              className={className}
              aria-pressed={isSelected}
              onClick={() => onRangeChange(toggleYear(range, year))}
            >
              {year}
            </button>
          );
        })}
      </div>
      {years.length > 1 && <p className="year-chips__hint">{t("all.yearsHint")}</p>}
    </fieldset>
  );
}
