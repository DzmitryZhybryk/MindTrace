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

/**
 * Отрезок, вдоль которого кусок дуги гаснет у своего края — там, где дуга ушла за край мира.
 *
 * Начало отрезка — в точке куска, отстоящей от края на `length` вдоль дуги (или в дальнем конце
 * куска, если он короче), конец — на самом краю. По нему кладётся градиент прозрачности линии.
 */
export function fadeAlong(
  piece: readonly ScreenPoint[],
  edge: "start" | "end",
  length: number,
): readonly [ScreenPoint, ScreenPoint] {
  const points = edge === "end" ? [...piece].reverse() : piece;
  const tip = points[0];
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    travelled += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
    if (travelled >= length) {
      return [points[index], tip];
    }
  }

  return [points[points.length - 1], tip];
}
