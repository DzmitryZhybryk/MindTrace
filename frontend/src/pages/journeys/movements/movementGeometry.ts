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

/** SVG-путь дуги: каждый кусок начинается своим `M`, конец пути — в точке назначения. */
export function arcPath(pieces: ArcPieces): string {
  return pieces
    .map((piece) =>
      piece.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(""),
    )
    .join("");
}
