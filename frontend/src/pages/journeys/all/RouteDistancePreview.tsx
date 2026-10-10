import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { estimateJourneyDistanceOptions, type JourneyFeedEntry, type PlaceSearchItem } from "../../../api/sdk";
import { hasCountry } from "../journeyFormRules";

interface RouteDistancePreviewProps {
  /** The saved journey: its pair needs no request, its distance is already known. */
  journey: JourneyFeedEntry;
  origin: PlaceSearchItem | null;
  destination: PlaceSearchItem | null;
  distanceFormat: Intl.NumberFormat;
}

/**
 * Distance of the pair picked in the row editor, before saving.
 *
 * Always rendered with the same height: the feed's FLIP measures rows on every render. An incomplete
 * or invalid pair, or a failed request, shows a dash; while a new pair is being calculated the dash is
 * dimmed and `aria-busy`. No previous number is kept: editing a place field already clears the pick
 * (`PlaceAutocomplete` emits `null` on typing), so every new pair starts from the dash anyway.
 */
export function RouteDistancePreview({ journey, origin, destination, distanceFormat }: RouteDistancePreviewProps) {
  const { t } = useTranslation("journeys");
  const isSavedPair = origin?.placeId === journey.origin.placeId && destination?.placeId === journey.destination.placeId;
  const isPairValid = Boolean(
    origin && destination && hasCountry(origin) && hasCountry(destination) && origin.placeId !== destination.placeId,
  );
  const distanceQuery = useQuery({
    ...estimateJourneyDistanceOptions({
      query: { originPlaceId: origin?.placeId ?? "", destinationPlaceId: destination?.placeId ?? "" },
    }),
    enabled: isPairValid && !isSavedPair,
    // The distance of a pair never changes.
    staleTime: Infinity,
  });

  // `undefined` = the new pair is still being calculated; `null` = nothing to show.
  let settledKm: number | null | undefined;
  if (isSavedPair) {
    settledKm = journey.distanceKm;
  } else if (!isPairValid || distanceQuery.isError) {
    settledKm = null;
  } else {
    settledKm = distanceQuery.data?.distanceKm;
  }

  const isRecalculating = settledKm === undefined;
  const shownKm = settledKm ?? null;

  return (
    <p className="journey-editor__distance" aria-live="polite" aria-busy={isRecalculating}>
      {t("all.distance")}{" "}
      <span
        className={
          isRecalculating
            ? "journey-editor__distance-value journey-editor__distance-value--recalculating"
            : "journey-editor__distance-value"
        }
      >
        {shownKm === null ? "—" : distanceFormat.format(shownKm)}
      </span>
    </p>
  );
}
