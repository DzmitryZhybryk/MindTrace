import { boxesIntersect, type LabelBox } from "../../../components/globe/labelDeclutter";
import type { ArcPieces } from "./movementGeometry";

/** Место на холсте, которому нужна подпись. */
export interface LabelledPlace {
  placeId: string;
  x: number;
  y: number;
  label: string;
  /** Сколько маршрутов проходит через место: подписи оживлённых мест раскладываются первыми. */
  routeCount: number;
}

/** Размеры подписи в единицах холста при текущем масштабе. */
export interface LabelMetrics {
  fontSize: number;
  /** Отступ подписи от центра точки. */
  gap: number;
  dotRadius: number;
  /** Зазор, который подпись держит от линий и других подписей. */
  clearance: number;
}

/** Подпись, получившая место: `anchor` — выравнивание текста относительно `x`. */
export interface PlacedLabel {
  placeId: string;
  label: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

type Point = readonly [number, number];

// Ширину текста оцениваем, а не меряем: в jsdom нет ни canvas.measureText, ни
// getComputedTextLength. Коэффициент с запасом — широкие буквы кириллицы не должны
// вылезать за оценку.
const CHAR_WIDTH_RATIO = 0.62;
const LINE_HEIGHT_RATIO = 1.25;
// Диагональные позиции ближе к точке: иначе подпись «отлетает» от неё.
const DIAGONAL_GAP_RATIO = 0.7;

// Куда можно поставить подпись, в порядке предпочтения: справа привычнее всего читать.
const CANDIDATE_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
  [0, -1],
  [0, 1],
];

/** Пересекает ли отрезок прямоугольник (отсечение Лианга — Барски). */
function segmentHitsBox(start: Point, end: Point, box: LabelBox): boolean {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const edges: readonly (readonly [number, number])[] = [
    [-dx, start[0] - box.left],
    [dx, box.left + box.width - start[0]],
    [-dy, start[1] - box.top],
    [dy, box.top + box.height - start[1]],
  ];
  let enter = 0;
  let exit = 1;
  for (const [direction, distance] of edges) {
    if (direction === 0) {
      if (distance < 0) {
        return false;
      }

      continue;
    }

    const t = distance / direction;
    if (direction < 0) {
      enter = Math.max(enter, t);
    } else {
      exit = Math.min(exit, t);
    }

    if (enter > exit) {
      return false;
    }
  }

  return true;
}

function inflate(box: LabelBox, by: number): LabelBox {
  return { ...box, left: box.left - by, top: box.top - by, width: box.width + 2 * by, height: box.height + 2 * by };
}

/**
 * Раскладывает подписи мест так, чтобы они не наезжали друг на друга, на точки мест и на
 * дуги со стрелками.
 *
 * Жадно, в порядке приоритета (больше маршрутов — раньше, у равных — по id, чтобы раскладка
 * не прыгала): подпись занимает первую из позиций вокруг точки, где ничего не задевает. Если
 * такой нет — первую, где не задевает другие подписи и точки (линию пересечь можно). Если
 * нет и такой, подпись прячется: при приближении место для неё появится.
 */
export function placeLabels(
  places: readonly LabelledPlace[],
  arcs: readonly ArcPieces[],
  metrics: LabelMetrics,
): PlacedLabel[] {
  const segments: [Point, Point][] = [];
  for (const pieces of arcs) {
    for (const piece of pieces) {
      for (let index = 1; index < piece.length; index += 1) {
        segments.push([piece[index - 1], piece[index]]);
      }
    }
  }

  const dots: LabelBox[] = places.map((place) => ({
    id: place.placeId,
    left: place.x - metrics.dotRadius,
    top: place.y - metrics.dotRadius,
    width: 2 * metrics.dotRadius,
    height: 2 * metrics.dotRadius,
  }));

  const byPriority = [...places].sort(
    (left, right) => right.routeCount - left.routeCount || (left.placeId < right.placeId ? -1 : 1),
  );

  const acceptedBoxes: LabelBox[] = [];
  const placed: PlacedLabel[] = [];
  for (const place of byPriority) {
    const width = place.label.length * metrics.fontSize * CHAR_WIDTH_RATIO;
    const height = metrics.fontSize * LINE_HEIGHT_RATIO;
    const candidates = CANDIDATE_DIRECTIONS.map(([dx, dy]) => {
      const gap = dx !== 0 && dy !== 0 ? metrics.gap * DIAGONAL_GAP_RATIO : metrics.gap;
      const left = dx > 0 ? place.x + gap : dx < 0 ? place.x - gap - width : place.x - width / 2;
      const top = dy > 0 ? place.y + gap : dy < 0 ? place.y - gap - height : place.y - height / 2;
      const box: LabelBox = { id: place.placeId, left, top, width, height };
      const anchor: PlacedLabel["anchor"] = dx > 0 ? "start" : dx < 0 ? "end" : "middle";
      const x = dx > 0 ? left : dx < 0 ? left + width : left + width / 2;
      return { box, label: { placeId: place.placeId, label: place.label, x, y: top + height / 2, anchor } };
    });

    const touchesLabelsOrDots = (box: LabelBox) =>
      acceptedBoxes.some((other) => boxesIntersect(box, other, metrics.clearance)) ||
      dots.some((dot) => dot.id !== place.placeId && boxesIntersect(box, dot, 0));
    const touchesLines = (box: LabelBox) => {
      const padded = inflate(box, metrics.clearance);
      return segments.some(([start, end]) => segmentHitsBox(start, end, padded));
    };

    const chosen =
      candidates.find(({ box }) => !touchesLabelsOrDots(box) && !touchesLines(box)) ??
      candidates.find(({ box }) => !touchesLabelsOrDots(box));
    if (chosen) {
      acceptedBoxes.push(chosen.box);
      placed.push(chosen.label);
    }
  }

  return placed;
}
