import { useMemo } from "react";

import type { MapPoint } from "../../../api/sdk";
import { projectToScreen } from "../../../components/worldProjection";
import { placeLabels } from "./labelPlacement";
import { piecePath, splitEdgeFade, type ArcPieces } from "./movementGeometry";

/** A from -> to route with its arc already projected. */
export interface ProjectedConnection {
  key: string;
  origin: MapPoint;
  destination: MapPoint;
  /** Years of journeys on the route, ascending: they decide whether the route falls in the year window. */
  years: readonly number[];
  arc: ArcPieces;
}

interface MovementConnectionsProps {
  connections: readonly ProjectedConnection[];
  /**
   * Share of the world width taken by the visible area. Arrows and dots are in canvas units;
   * without this correction they would grow with the map when zoomed in.
   */
  unitScale: number;
  /** Place label by id; `undefined` means the name is still loading, no label. */
  labelOf: (placeId: string) => string | undefined;
}

// Sizes in canvas units when the whole map is visible.
const ARROW_SIZE = 7;
const DOT_RADIUS = 2.2;
const LABEL_FONT_SIZE = 8;
// Label offset from the dot edge, clearance from lines and neighbouring labels, halo stroke behind the text.
const LABEL_GAP = 2;
const LABEL_CLEARANCE = 1.2;
const LABEL_HALO_WIDTH = 2.4;
// An arc across the world edge fades at the cut over this length instead of ending abruptly mid-ocean.
const EDGE_FADE_LENGTH = 40;
// One marker per layer: the page has a single movements map.
const ARROW_MARKER_ID = "movement-arrow";

/**
 * Movements map layer over `WorldMap`: a dot with a name for each place and an arc with an arrow
 * for each route. Trips there and back share one arc, so arrows appear at both ends.
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

  // Labels keep a constant on-screen size, so the layout is recomputed with the zoom.
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
      {/* Dots under the lines: the arrow tip lands on the destination dot instead of hiding under it. */}
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

          // An arc across the world edge is two pieces: the first fades toward the cut, the second
          // emerges from it. Only the tail at the cut fades; the rest of the arc is solid.
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
                // The arrow goes on the part that ends at the destination point.
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
                      // Inline, not an attribute: the stroke from the line's CSS class would override an attribute.
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
      {/* Labels over the lines: if there is no crossing-free spot, an arc does not strike through the name. */}
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
