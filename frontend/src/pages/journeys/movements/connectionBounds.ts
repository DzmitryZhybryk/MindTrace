import type { ViewBox } from "../../../components/worldProjection";
import type { ArcPieces } from "./movementGeometry";

/**
 * Прямоугольник холста, в котором лежат все дуги, — под него подгоняется карта.
 *
 * `null` — подгонять нечего: маршрутов нет, или какая-то дуга пересекает антимеридиан и
 * лежит у обоих краёв карты сразу; тогда карта показывает весь мир.
 */
export function connectionBounds(arcs: readonly ArcPieces[]): ViewBox | null {
  if (arcs.length === 0 || arcs.some((pieces) => pieces.length > 1)) {
    return null;
  }

  // Циклом, а не Math.min(...points): у тысяч дуг точек больше, чем функция принимает аргументов.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of arcs.flatMap((pieces) => pieces.flat())) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
