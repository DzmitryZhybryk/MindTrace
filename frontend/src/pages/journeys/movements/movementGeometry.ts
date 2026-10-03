import { greatCirclePoint } from "../../../components/globe/route";
import { ANTIMERIDIAN_JUMP, projectToScreen } from "../../../components/worldProjection";

/** Точка холста плоской карты: `[x, y]`. */
type ScreenPoint = readonly [number, number];

/**
 * Дуга маршрута на холсте. Обычно это один кусок; дуга через антимеридиан разрезана на два,
 * иначе её хвост протянулся бы через всю карту.
 */
export type ArcPieces = readonly (readonly ScreenPoint[])[];

interface Coordinates {
  latitude: number;
  longitude: number;
}

// Дуга большого круга рисуется ломаной: при таком числе отрезков изломов не видно даже на полмира.
const ARC_SEGMENTS = 48;

/** Проецирует дугу большого круга между двумя местами на холст карты. */
export function projectArc(origin: Coordinates, destination: Coordinates): ArcPieces {
  const pieces: ScreenPoint[][] = [];
  let prevLng: number | null = null;
  for (let step = 0; step <= ARC_SEGMENTS; step += 1) {
    const { lat, lng } = greatCirclePoint(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
      step / ARC_SEGMENTS,
    );
    if (prevLng === null || Math.abs(lng - prevLng) > ANTIMERIDIAN_JUMP) {
      pieces.push([]);
    }

    pieces[pieces.length - 1].push(projectToScreen(lng, lat));
    prevLng = lng;
  }

  return pieces;
}

/** SVG-путь куска дуги. */
export function piecePath(piece: readonly ScreenPoint[]): string {
  return piece.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
}

/** Кусок дуги, разделённый для затухания у края мира. */
export interface EdgeFadeSplit {
  /** Сплошная часть куска, в порядке рисования; пустая, если кусок целиком короче затухания. */
  solid: readonly ScreenPoint[];
  /** Гаснущий хвост у края, в порядке рисования. */
  fade: readonly ScreenPoint[];
  /** Ось градиента прозрачности: от точки, где хвост начинает гаснуть, до самого края. */
  fadeAxis: readonly [ScreenPoint, ScreenPoint];
}

/**
 * Делит кусок дуги на сплошную часть и хвост длиной `length` вдоль дуги у края, где дуга ушла
 * за край мира. Градиент кладётся только на хвост: линейный градиент на весь кусок гасил бы
 * дугу по направлению хвоста, а не по длине, — и дуга, повернувшая после края, пропадала.
 *
 * Args:
 *     piece: Кусок дуги.
 *     edge: Какой конец куска лежит на краю мира.
 *     length: Длина затухания вдоль дуги, в единицах холста.
 *
 * Returns:
 *     Сплошная часть, хвост и ось градиента хвоста.
 */
export function splitEdgeFade(piece: readonly ScreenPoint[], edge: "start" | "end", length: number): EdgeFadeSplit {
  // Идём от края внутрь, пока не наберём длину затухания.
  const fromEdge = edge === "end" ? [...piece].reverse() : [...piece];
  const fade: ScreenPoint[] = [fromEdge[0]];
  let travelled = 0;
  let index = 1;
  for (; index < fromEdge.length; index += 1) {
    const [prevX, prevY] = fromEdge[index - 1];
    const [x, y] = fromEdge[index];
    const step = Math.hypot(x - prevX, y - prevY);
    if (travelled + step >= length) {
      // Точка начала затухания — внутри этого отрезка, на нужной длине от края.
      const ratio = step === 0 ? 0 : (length - travelled) / step;
      fade.push([prevX + (x - prevX) * ratio, prevY + (y - prevY) * ratio]);
      break;
    }

    travelled += step;
    fade.push(fromEdge[index]);
  }

  const inner = fade[fade.length - 1];
  const rest = fromEdge.slice(index);
  // Затухание кончилось ровно в вершине — она уже первая в остатке, второй раз не нужна.
  const isSplitAtVertex = rest.length > 0 && rest[0][0] === inner[0] && rest[0][1] === inner[1];
  const solidFromEdge = rest.length === 0 || isSplitAtVertex ? rest : [inner, ...rest];
  const inDrawingOrder = (points: ScreenPoint[]) => (edge === "end" ? points.reverse() : points);

  return { solid: inDrawingOrder(solidFromEdge), fade: inDrawingOrder(fade), fadeAxis: [inner, fromEdge[0]] };
}
