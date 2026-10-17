import type { JourneyFeedEntry } from "../api/sdk";

const PLACE = { placeId: "11111111-1111-4111-8111-111111111111", countryCode: "RU", latitude: 55.75, longitude: 37.62 };

/**
 * A feed row for unit tests where only id and year matter (grouping, move). Places and other
 * fields are stubs that such tests do not read.
 */
export function makeFeedJourney(journeyId: string, traveledYear: number): JourneyFeedEntry {
  return { journeyId, origin: PLACE, destination: PLACE, transportType: "air", traveledYear, distanceKm: 1 };
}
