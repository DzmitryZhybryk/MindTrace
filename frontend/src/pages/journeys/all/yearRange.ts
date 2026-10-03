/** Диапазон лет ленты `[с, по]`, обе границы включительно; `null` — все годы. */
export type YearRange = readonly [from: number, to: number];

/**
 * Выбранные годы, вписанные в текущую шкалу.
 *
 * Шкала меняется после правки и удаления поездок, а выбор, вышедший за неё, без ползунка не снять.
 *
 * Returns:
 *     `null` — все годы: ничего не выбрано, выбор покрывает всю шкалу или целиком вышел за неё,
 *     шкалы нет или в ней один год (ползунка тогда нет).
 */
export function fitYearRange(
  yearRange: YearRange | null,
  firstYear: number | undefined,
  lastYear: number | undefined,
): YearRange | null {
  if (yearRange === null || firstYear === undefined || lastYear === undefined || firstYear === lastYear) {
    return null;
  }

  const from = Math.max(yearRange[0], firstYear);
  const to = Math.min(yearRange[1], lastYear);
  if (from > to || (from === firstYear && to === lastYear)) {
    return null;
  }

  return [from, to];
}
