import { useMemo } from "react";

import type { MapPoint } from "../../../api/sdk";
import { projectToScreen } from "../../../components/worldProjection";
import { placeLabels } from "./labelPlacement";
import { piecePath, splitEdgeFade, type ArcPieces } from "./movementGeometry";

/** Маршрут «откуда → куда» с уже спроецированной дугой. */
export interface ProjectedConnection {
  key: string;
  origin: MapPoint;
  destination: MapPoint;
  /** Годы поездок по маршруту, по возрастанию: по ним маршрут попадает в окно лет или нет. */
  years: readonly number[];
  arc: ArcPieces;
}

interface MovementConnectionsProps {
  connections: readonly ProjectedConnection[];
  /**
   * Доля ширины мира, которую занимает видимая область. Стрелки и точки задаются в
   * единицах холста — без поправки они росли бы при приближении карты вместе с ней.
   */
  unitScale: number;
  /** Подпись места по его id; `undefined` — название ещё грузится, подписи нет. */
  labelOf: (placeId: string) => string | undefined;
}

// Размеры в единицах холста, когда видна вся карта.
const ARROW_SIZE = 7;
const DOT_RADIUS = 2.2;
const LABEL_FONT_SIZE = 8;
// Отступ подписи от края точки, зазор до линий и соседних подписей, обводка-подложка под текстом.
const LABEL_GAP = 2;
const LABEL_CLEARANCE = 1.2;
const LABEL_HALO_WIDTH = 2.4;
// Дуга через край мира гаснет у разреза на этой длине — а не обрывается посреди океана.
const EDGE_FADE_LENGTH = 40;
// Один маркер на слой: на странице одна карта перемещений.
const ARROW_MARKER_ID = "movement-arrow";

/**
 * Слой карты перемещений поверх `WorldMap`: точка с названием на каждое место и дуга со
 * стрелкой на каждый маршрут. Поездки туда и обратно ложатся на одну дугу, и стрелки
 * оказываются на обоих её концах.
 */
export function MovementConnections({ connections, unitScale, labelOf }: MovementConnectionsProps) {
  const placeDots = useMemo(() => {
    const places = new Map<string, { place: MapPoint; routeCount: number }>();
    for (const connection of connections) {
      for (const place of [connection.origin, connection.destination]) {
        const seen = places.get(place.placeId);
        places.set(place.placeId, { place, routeCount: (seen?.routeCount ?? 0) + 1 });
      }
    }

    return [...places.values()].map(({ place, routeCount }) => {
      const [cx, cy] = projectToScreen(place.longitude, place.latitude);
      return { key: place.placeId, cx, cy, routeCount };
    });
  }, [connections]);

  // Подписи держат постоянный размер на экране, поэтому раскладка пересчитывается с масштабом.
  const labels = useMemo(() => {
    const labelledPlaces = placeDots.flatMap((dot) => {
      const label = labelOf(dot.key);
      return label ? [{ placeId: dot.key, x: dot.cx, y: dot.cy, label, routeCount: dot.routeCount }] : [];
    });
    return placeLabels(
      labelledPlaces,
      connections.map((connection) => connection.arc),
      {
        fontSize: LABEL_FONT_SIZE * unitScale,
        gap: (DOT_RADIUS + LABEL_GAP) * unitScale,
        dotRadius: DOT_RADIUS * unitScale,
        clearance: LABEL_CLEARANCE * unitScale,
      },
    );
  }, [placeDots, connections, labelOf, unitScale]);

  const arrowSize = ARROW_SIZE * unitScale;

  return (
    <>
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerUnits="userSpaceOnUse"
          markerWidth={arrowSize}
          markerHeight={arrowSize}
          orient="auto"
        >
          <path className="movement-arrow" d="M0 1L10 5L0 9Z" />
        </marker>
      </defs>
      {/* Точки под линиями: остриё стрелки ложится на точку назначения, а не прячется под ней. */}
      <g>
        {placeDots.map((dot) => (
          <circle
            key={dot.key}
            className="movement-dot"
            cx={dot.cx}
            cy={dot.cy}
            r={DOT_RADIUS * unitScale}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <g>
        {connections.map((connection, connectionIndex) => {
          const [first, second] = connection.arc;
          if (!second) {
            return (
              <path
                key={connection.key}
                className="movement-line"
                d={piecePath(first)}
                markerEnd={`url(#${ARROW_MARKER_ID})`}
                vectorEffect="non-scaling-stroke"
              />
            );
          }

          // Дуга через край мира — два куска: первый гаснет к разрезу, второй из него проявляется.
          // Гаснет только хвост у разреза, остальная дуга — сплошная.
          const fadeLength = EDGE_FADE_LENGTH * unitScale;
          const pieces = [
            { split: splitEdgeFade(first, "end", fadeLength), endsAtDestination: false },
            { split: splitEdgeFade(second, "start", fadeLength), endsAtDestination: true },
          ];
          return (
            <g key={connection.key}>
              {pieces.map(({ split, endsAtDestination }, pieceIndex) => {
                const gradientId = `movement-edge-fade-${connectionIndex}-${pieceIndex}`;
                const [[innerX, innerY], [edgeX, edgeY]] = split.fadeAxis;
                const hasSolid = split.solid.length > 1;
                // Стрелка — на той части, что кончается в точке назначения.
                const arrow = `url(#${ARROW_MARKER_ID})`;
                return (
                  <g key={gradientId}>
                    <defs>
                      <linearGradient
                        id={gradientId}
                        gradientUnits="userSpaceOnUse"
                        x1={innerX}
                        y1={innerY}
                        x2={edgeX}
                        y2={edgeY}
                      >
                        <stop offset="0" style={{ stopColor: "var(--movement-line)", stopOpacity: 1 }} />
                        <stop offset="1" style={{ stopColor: "var(--movement-line)", stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <path
                      className="movement-line"
                      // Инлайн, а не атрибутом: stroke из CSS-класса линии перебил бы атрибут.
                      style={{ stroke: `url(#${gradientId})` }}
                      d={piecePath(split.fade)}
                      markerEnd={endsAtDestination && !hasSolid ? arrow : undefined}
                      vectorEffect="non-scaling-stroke"
                    />
                    {hasSolid && (
                      <path
                        className="movement-line"
                        d={piecePath(split.solid)}
                        markerEnd={endsAtDestination ? arrow : undefined}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>
      {/* Подписи — поверх линий: если места без пересечения нет, дуга не перечёркивает название. */}
      <g>
        {labels.map((label) => (
          <text
            key={label.placeId}
            className="movement-label"
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
            fontSize={LABEL_FONT_SIZE * unitScale}
            strokeWidth={LABEL_HALO_WIDTH * unitScale}
            dominantBaseline="central"
          >
            {label.label}
          </text>
        ))}
      </g>
    </>
  );
}
