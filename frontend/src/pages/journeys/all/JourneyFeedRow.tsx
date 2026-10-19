import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { VisuallyHidden } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { placeLabel, type PlaceNameLookup } from "../../../api/placeNames";
import type { JourneyFeedEntry } from "../../../api/sdk";
import { TRANSPORT_ICONS } from "../../../components/transportIcons";
import type { JourneyEditField } from "./JourneyRowEditor";
import { useAnimatedNumber } from "./motion";

const TRANSPORT_ICON_SIZE = 22;

interface JourneyFeedRowProps {
  journey: JourneyFeedEntry;
  nameOf: PlaceNameLookup;
  distanceFormat: Intl.NumberFormat;
  /** A click on a row field opens editing with focus in that field. */
  onEdit: (field: JourneyEditField) => void;
  isDragDisabled: boolean;
  /** Year the row lands in if dropped now; set only on the dragged row. */
  dropYear: number | null;
  /** The row was just saved: it flashes a highlight, then calls `onSavedShown`. */
  isSaved: boolean;
  onSavedShown: () => void;
}

/** Drag grip: two columns of dots; a UI control drawn in `currentColor`. */
function GripIcon() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true" fill="currentColor">
      {[2, 6].map((x) => [2, 7, 12].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
    </svg>
  );
}

/**
 * Feed row: grip, transport, "from -> to" and distance. An ellipsis shows while names load.
 *
 * Transport and places are borderless buttons: pressing opens row editing. The backend computes
 * the distance, so it is not clickable. A row is dragged by the grip with mouse, finger or
 * keyboard (space, arrows, space); moving to another year shows "-> year" beside it.
 */
export function JourneyFeedRow({
  journey,
  nameOf,
  distanceFormat,
  onEdit,
  isDragDisabled,
  dropYear,
  isSaved,
  onSavedShown,
}: JourneyFeedRowProps) {
  const { t } = useTranslation("journeys");
  const { t: tCommon } = useTranslation("common");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: journey.journeyId,
    disabled: isDragDisabled,
  });

  const unknownLabel = tCommon("map.unknownPlace");
  const origin = placeLabel(nameOf(journey.origin.placeId), unknownLabel);
  const destination = placeLabel(nameOf(journey.destination.placeId), unknownLabel);
  const transportLabel = t(`addJourney.transport.${journey.transportType}`);
  const isChangingYear = isDragging && dropYear !== null && dropYear !== journey.traveledYear;
  const distanceKm = useAnimatedNumber(journey.distanceKm);
  const className = ["journey-row", isDragging && "journey-row--dragging", isSaved && "journey-row--saved"]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      ref={setNodeRef}
      className={className}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-flip-id={journey.journeyId}
      onAnimationEnd={(event) => {
        if (isSaved && event.animationName === "journey-row-saved") {
          onSavedShown();
        }
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="journey-row__handle"
        aria-label={t("all.dragHandle")}
        disabled={isDragDisabled}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <button type="button" className="journey-row__field" title={transportLabel} onClick={() => onEdit("transport")}>
        <img
          src={TRANSPORT_ICONS[journey.transportType]}
          width={TRANSPORT_ICON_SIZE}
          height={TRANSPORT_ICON_SIZE}
          alt={transportLabel}
        />
      </button>
      <span className="journey-row__route">
        <button type="button" className="journey-row__field journey-row__place" onClick={() => onEdit("origin")}>
          {origin ?? "…"}
        </button>
        <span className="journey-row__arrow" aria-hidden="true">
          →
        </span>
        <VisuallyHidden>{` ${t("all.routeTo")} `}</VisuallyHidden>
        <button type="button" className="journey-row__field journey-row__place" onClick={() => onEdit("destination")}>
          {destination ?? "…"}
        </button>
      </span>
      {/* The key is the year: moving to the next year flips the hint again. */}
      {isChangingYear ? (
        <span key={dropYear} className="journey-row__drop-year">
          → {dropYear}
        </span>
      ) : (
        <span className="journey-row__distance">{distanceFormat.format(distanceKm)}</span>
      )}
    </li>
  );
}
