import { useCallback, useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import { placeLabel, usePlaceNames } from "../../../api/placeNames";
import type { JourneyFeedEntry } from "../../../api/sdk";
import type { MapCountry } from "../../../components/WorldMap";
import { WorldMap } from "../../../components/WorldMap";
import { projectToScreen, WORLD_VIEW_BOX, type ViewBox } from "../../../components/worldProjection";
import { MAP_TONE } from "../journeys-data";
import { connectionBounds } from "../movements/connectionBounds";
import { placeLabels } from "../movements/labelPlacement";
import { piecePath, projectArc } from "../movements/movementGeometry";

const NO_COUNTRIES: MapCountry[] = [];
// Sizes in canvas units at the whole-world view.
const DOT_RADIUS = 2.6;
const LINE_WIDTH = 1.8;
const LABEL_FONT_SIZE = 8;
// Label offset from the dot edge, clearance from the arc, halo stroke behind the text.
const LABEL_GAP = 2;
const LABEL_CLEARANCE = 1.2;
const LABEL_HALO_WIDTH = 2.4;

interface FeedBackdropMapProps {
  /** Loaded feed journeys: before the first hover the frame covers all of them. */
  journeys: readonly JourneyFeedEntry[];
  /** Journey whose arc to show; `null` means a map without an arc. */
  activeJourney: JourneyFeedEntry | null;
  /** Feed column over the map: the frame fits into the part it does not cover. */
  occluderRef: RefObject<HTMLElement | null>;
}

/**
 * Muted world map behind the feed, visible through the column: the arc of the journey the user is
 * on (hovered, focused, edited or dragged) with place names at the ends. The map is background and
 * not clickable.
 *
 * The frame glides to the hovered journey and stays on it after the cursor leaves the feed, so the
 * map does not jump back and forth. Before the first hover the frame covers all loaded journeys.
 * The arc is redrawn for each new journey, keyed by its id.
 */
export function FeedBackdropMap({ journeys, activeJourney, occluderRef }: FeedBackdropMapProps) {
  const { t } = useTranslation("common");
  const [framedJourney, setFramedJourney] = useState<JourneyFeedEntry | null>(null);
  if (activeJourney !== null && activeJourney !== framedJourney) {
    setFramedJourney(activeJourney);
  }

  // Same place set as the feed: names come from its request, no new one per hover.
  const nameOf = usePlaceNames(journeys.flatMap((journey) => [journey.origin.placeId, journey.destination.placeId]));
  const unknownLabel = t("map.unknownPlace");

  const fitBounds = useMemo(() => {
    const framed = framedJourney ? [framedJourney] : journeys;
    return connectionBounds(framed.map((journey) => projectArc(journey.origin, journey.destination)));
  }, [framedJourney, journeys]);
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
      const ends = [activeJourney.origin, activeJourney.destination].map((place) => {
        const [x, y] = projectToScreen(place.longitude, place.latitude);
        return { placeId: place.placeId, x, y };
      });
      // A journey from a place to itself is one dot and one label.
      const places = ends[0].placeId === ends[1].placeId ? [ends[0]] : ends;
      const labels = placeLabels(
        places.flatMap((place) => {
          const label = placeLabel(nameOf(place.placeId), unknownLabel);
          return label ? [{ ...place, label, routeCount: 1 }] : [];
        }),
        [arc],
        {
          fontSize: LABEL_FONT_SIZE * unitScale,
          gap: (DOT_RADIUS + LABEL_GAP) * unitScale,
          dotRadius: DOT_RADIUS * unitScale,
          clearance: LABEL_CLEARANCE * unitScale,
        },
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
          {places.map((place) => (
            <circle key={place.placeId} className="feed-arc__dot" cx={place.x} cy={place.y} r={DOT_RADIUS * unitScale} />
          ))}
          {labels.map((label) => (
            <text
              key={label.placeId}
              className="feed-arc__label"
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
      );
    },
    [activeJourney, arc, nameOf, unknownLabel],
  );

  return (
    <WorldMap
      className="journeys-map feed-map"
      countries={NO_COUNTRIES}
      tone={MAP_TONE}
      fitBounds={fitBounds}
      occluderRef={occluderRef}
      shouldFadeUnderOccluder={false}
      isFitAnimated
      isInteractive={false}
      overlay={overlay}
    />
  );
}
