import type { FormValidateInput, UseFormReturnType } from "@mantine/form";

import { ApiError, errorCodeToken } from "../../api/errors";
import type { PlaceRef, PlaceSearchItem, TransportType } from "../../api/sdk";

/** Journey fields, shared by add and edit. */
export type JourneyFormValues = {
  origin: PlaceSearchItem | null;
  destination: PlaceSearchItem | null;
  transport: TransportType | null;
  year: string | null;
};

const UNKNOWN_PLACE_CODE = "journeys.unknown_place";

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

/** Suggested place -> request body: the backend verifies the place by `placeId`. */
export function toPlaceRef(place: PlaceWithCountry): PlaceRef {
  return { placeId: place.placeId, countryCode: place.countryCode, latitude: place.latitude, longitude: place.longitude };
}

/**
 * Highlights fields whose places the backend did not find (`journeys.unknown_place`).
 *
 * The backend returns only the ids of unknown places; the form decides which field to highlight
 * by comparing them with the picked places.
 *
 * Returns `true` if the error was handled and shown at the fields.
 */
export function applyUnknownPlaceError(
  err: unknown,
  values: JourneyFormValues,
  form: UseFormReturnType<JourneyFormValues>,
): boolean {
  if (!(err instanceof ApiError) || err.code !== UNKNOWN_PLACE_CODE) {
    return false;
  }

  const rawIds = err.details?.place_ids;
  const missing = new Set(Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : []);
  let isApplied = false;
  for (const field of ["origin", "destination"] as const) {
    const place = values[field];
    if (place && missing.has(place.placeId)) {
      form.setFieldError(field, errorCodeToken(UNKNOWN_PLACE_CODE));
      isApplied = true;
    }
  }

  return isApplied;
}
