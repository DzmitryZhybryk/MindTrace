import { useCallback, useMemo, type RefObject } from "react";

import type { JourneyFeedEntry } from "../../../api/sdk";
import type { MapCountry } from "../../../components/WorldMap";
import { WorldMap } from "../../../components/WorldMap";
import { projectToScreen, WORLD_VIEW_BOX, type ViewBox } from "../../../components/worldProjection";
import { MAP_TONE } from "../journeys-data";
import { connectionBounds } from "../movements/connectionBounds";
import { piecePath, projectArc } from "../movements/movementGeometry";

const NO_COUNTRIES: MapCountry[] = [];
// Размеры в единицах холста при виде на весь мир.
const DOT_RADIUS = 2.6;
const LINE_WIDTH = 1.8;

interface FeedBackdropMapProps {
  /** Загруженные поездки ленты — кадр карты охватывает их все. */
  journeys: readonly JourneyFeedEntry[];
  /** Поездка, чью дугу показать; `null` — карта без дуги. */
  activeJourney: JourneyFeedEntry | null;
  /** Колонка ленты поверх карты: кадр подгоняется в незакрытую ею часть. */
  occluderRef: RefObject<HTMLElement | null>;
}

/**
 * Приглушённая карта мира за лентой: дуга поездки, на которой сейчас пользователь, — под курсором,
 * в фокусе, в правке или в перетаскивании. Карта — фон: не нажимается.
 *
 * Кадр охватывает все загруженные поездки, а не активную: при переходе со строки на строку
 * меняется только дуга, карта не прыгает. Дуга прочерчивается заново на каждую новую поездку —
 * ключом служит её id.
 */
export function FeedBackdropMap({ journeys, activeJourney, occluderRef }: FeedBackdropMapProps) {
  const fitBounds = useMemo(
    () => connectionBounds(journeys.map((journey) => projectArc(journey.origin, journey.destination))),
    [journeys],
  );
  const arc = useMemo(
    () => (activeJourney ? projectArc(activeJourney.origin, activeJourney.destination) : null),
    [activeJourney],
  );

  const overlay = useCallback(
    (view: ViewBox) => {
      if (!activeJourney || !arc) {
        return null;
      }

      const unitScale = view.width / WORLD_VIEW_BOX.width;
      const ends = [activeJourney.origin, activeJourney.destination].map((place) =>
        projectToScreen(place.longitude, place.latitude),
      );
      return (
        <g key={activeJourney.journeyId} className="feed-arc">
          {arc.map((piece) => (
            <path
              key={`${piece[0][0]},${piece[0][1]}`}
              className="feed-arc__line"
              d={piecePath(piece)}
              pathLength={1}
              strokeWidth={LINE_WIDTH * unitScale}
            />
          ))}
          {ends.map(([cx, cy], index) => (
            <circle
              key={index === 0 ? "origin" : "destination"}
              className="feed-arc__dot"
              cx={cx}
              cy={cy}
              r={DOT_RADIUS * unitScale}
            />
          ))}
        </g>
      );
    },
    [activeJourney, arc],
  );

  return (
    <WorldMap
      className="journeys-map feed-map"
      countries={NO_COUNTRIES}
      tone={MAP_TONE}
      fitBounds={fitBounds}
      occluderRef={occluderRef}
      isInteractive={false}
      overlay={overlay}
    />
  );
}
