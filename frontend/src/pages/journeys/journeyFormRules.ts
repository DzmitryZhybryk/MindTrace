import type { FormValidateInput, UseFormReturnType } from "@mantine/form";

import { ApiError, errorCodeToken } from "../../api/errors";
import type { PlaceSearchItem, TransportType } from "../../api/sdk";

/** Journey fields, shared by add and edit. */
export type JourneyFormValues = {
  origin: PlaceSearchItem | null;
  destination: PlaceSearchItem | null;
  transport: TransportType | null;
  year: string | null;
};

const PLACE_ERROR_CODES: ReadonlySet<string> = new Set(["journeys.unknown_place", "journeys.place_without_country"]);

type PlaceWithCountry = PlaceSearchItem & { countryCode: string };

/**
 * Journey field validators.
 *
 * They return an i18n TOKEN (`journeys:addJourney.validation.*`), not text: it is resolved at
 * render (`resolveErrorToken`) so the error follows a language switch.
 */
export const JOURNEY_FORM_VALIDATE: FormValidateInput<JourneyFormValues> = {
  origin: (value) => {
    if (!value) {
      return "journeys:addJourney.validation.originRequired";
    }
    // A journey stores the place's country; the gazetteer allows places without one (seas, oceans).
    return value.countryCode ? null : "journeys:addJourney.validation.placeWithoutCountry";
  },
  destination: (value, values) => {
    if (!value) {
      return "journeys:addJourney.validation.destinationRequired";
    }
    if (!value.countryCode) {
      return "journeys:addJourney.validation.placeWithoutCountry";
    }
    // Reject the same city on the frontend too; the backend checks the same by placeId.
    if (values.origin && values.origin.placeId === value.placeId) {
      return "journeys:addJourney.validation.sameCity";
    }
    return null;
  },
  transport: (value) => (value ? null : "journeys:addJourney.validation.transportRequired"),
  year: (value) => (value ? null : "journeys:addJourney.validation.yearRequired"),
};

/** A journey needs the place's country; the form validator stops a place without one before submit. */
export function hasCountry(place: PlaceSearchItem): place is PlaceWithCountry {
  return Boolean(place.countryCode);
}

/**
 * Highlights fields whose places the backend rejected (`journeys.unknown_place`,
 * `journeys.place_without_country`).
 *
 * The backend returns only the ids of the rejected places; the form decides which field to highlight
 * by comparing them with the picked places.
 *
 * Returns `true` if the error was handled and shown at the fields.
 */
export function applyPlaceError(
  err: unknown,
  values: JourneyFormValues,
  form: UseFormReturnType<JourneyFormValues>,
): boolean {
  if (!(err instanceof ApiError) || !PLACE_ERROR_CODES.has(err.code)) {
    return false;
  }

  const rawIds = err.details?.place_ids;
  const rejected = new Set(Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : []);
  let isApplied = false;
  for (const field of ["origin", "destination"] as const) {
    const place = values[field];
    if (place && rejected.has(place.placeId)) {
      form.setFieldError(field, errorCodeToken(err.code));
      isApplied = true;
    }
  }

  return isApplied;
}
