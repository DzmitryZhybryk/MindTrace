import type { APIRequestContext } from "@playwright/test";

import { expect } from "../fixtures";

export type PlaceRef = { placeId: string; countryCode: string; latitude: number; longitude: number };

/** Finds a city via geo search and returns it in the form journey creation accepts. */
export async function findPlace(request: APIRequestContext, token: string, searchText: string): Promise<PlaceRef> {
  const response = await request.get("/v1/geo/places/search/", {
    headers: { Authorization: `Bearer ${token}` },
    params: { searchText, language: "en", limit: 1 },
  });
  expect(response.ok(), `place search failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const { items } = (await response.json()) as { items: (PlaceRef & { name: string })[] };
  expect(items.length, `газеттир не нашёл «${searchText}»`).toBeGreaterThan(0);
  const [place] = items;
  return { placeId: place.placeId, countryCode: place.countryCode, latitude: place.latitude, longitude: place.longitude };
}

interface JourneyInput {
  origin: PlaceRef;
  destination: PlaceRef;
  transportType: "land" | "air" | "water";
  traveledYear: number;
}

/** Creates a journey via the API on behalf of the token owner. */
export async function createJourney(request: APIRequestContext, token: string, journey: JourneyInput): Promise<void> {
  const created = await request.post("/v1/journeys/", {
    headers: { Authorization: `Bearer ${token}` },
    data: journey,
  });
  expect(created.ok(), `create journey failed: ${created.status()} ${await created.text()}`).toBeTruthy();
}
