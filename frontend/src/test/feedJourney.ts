import type { JourneyFeedEntry } from "../api/sdk";

const PLACE = { placeId: "11111111-1111-4111-8111-111111111111", countryCode: "RU", latitude: 55.75, longitude: 37.62 };

/**
 * Строка ленты для unit-тестов, где важны только id и год (группировка, перенос). Места и
 * остальные поля — заглушки, которые такие тесты не читают.
 */
export function makeFeedJourney(journeyId: string, traveledYear: number): JourneyFeedEntry {
  return { journeyId, origin: PLACE, destination: PLACE, transportType: "air", traveledYear, distanceKm: 1 };
}
