/** Диапазон лет ленты `[с, по]`, обе границы включительно; `null` — все годы. */
export type YearRange = readonly [from: number, to: number];

/**
 * Следующий диапазон после нажатия на чип года.
 *
 * Первое нажатие выбирает один год, нажатие на другой год растягивает выбор до диапазона между
 * ними, повторное нажатие на единственный выбранный год снимает выбор. Когда выбран диапазон,
 * нажатие начинает выбор заново с этого года.
 *
 * Args:
 *     range: Текущий диапазон или `null`, если выбраны все годы.
 *     year: Год нажатого чипа.
 *
 * Returns:
 *     Новый диапазон или `null` — все годы.
 */
export function toggleYear(range: YearRange | null, year: number): YearRange | null {
  if (!range) {
    return [year, year];
  }

  const [from, to] = range;
  if (from !== to) {
    return [year, year];
  }

  if (from === year) {
    return null;
  }

  return [Math.min(from, year), Math.max(from, year)];
}

/** Попадает ли год в диапазон; без диапазона — любой год. */
export function isYearInRange(range: YearRange | null, year: number): boolean {
  return !range || (year >= range[0] && year <= range[1]);
}
