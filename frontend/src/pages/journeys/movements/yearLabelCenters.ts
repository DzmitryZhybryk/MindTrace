import { clamp } from "../../../components/globe/route";

// Центры подписей годов не ближе этого — иначе они налезли бы друг на друга; и половина этого —
// отступ подписи от края ползунка. Год — 4 моноширинных символа 13px и поля кнопки, px.
const LABEL_SPACING_PX = 48;

/** Ручка ползунка: 0 — левая, 1 — правая. */
export type ThumbIndex = 0 | 1;

/**
 * Где по горизонтали стоят центры подписей годов (px от левого края ползунка).
 *
 * Обычно — ровно под своими ручками. Сошлись ручки ближе `LABEL_SPACING_PX` — подпись той, что
 * стоит, остаётся на месте, а подпись той, что двигают, дальше не приближается: держится на этом
 * расстоянии от соседней. Ни одна подпись не выходит за края ползунка; у самого края, где уступить
 * некуда, отходит уже стоящая подпись.
 */
export function yearLabelCenters(
  thumbs: readonly [number, number],
  movingThumb: ThumbIndex,
  sliderWidth: number,
): [number, number] {
  const half = LABEL_SPACING_PX / 2;
  const maxCenter = Math.max(sliderWidth - half, half);
  const centers: [number, number] = [clamp(thumbs[0], half, maxCenter), clamp(thumbs[1], half, maxCenter)];
  if (centers[1] - centers[0] >= LABEL_SPACING_PX) {
    return centers;
  }

  if (movingThumb === 1) {
    centers[1] = centers[0] + LABEL_SPACING_PX;
  } else {
    centers[0] = centers[1] - LABEL_SPACING_PX;
  }

  if (centers[1] > maxCenter) {
    centers[1] = maxCenter;
    centers[0] = maxCenter - LABEL_SPACING_PX;
  } else if (centers[0] < half) {
    centers[0] = half;
    centers[1] = half + LABEL_SPACING_PX;
  }

  return centers;
}
