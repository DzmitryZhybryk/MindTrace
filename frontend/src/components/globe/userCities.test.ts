import { describe, expect, it } from "vitest";

import type { JourneysMapResponse, MapCity, MapCountry } from "../../api/sdk";
import { citiesFromJourneysMap } from "./userCities";

const MOSCOW_ID = "11111111-1111-4111-8111-111111111111";
const LONDON_ID = "22222222-2222-4222-8222-222222222222";
const BRISTOL_ID = "33333333-3333-4333-8333-333333333333";

/** Строит страну карты с одним городом (лишние поля агрегата тут не важны). */
function country(countryCode: string, cities: MapCity[]): MapCountry {
  return { countryCode, cities };
}

/** Ответ /v1/journeys/map с заданными странами — то, что SDK отдаёт в `select`. */
function mapResponse(countries: MapCountry[]): JourneysMapResponse {
  return { countries };
}

describe("citiesFromJourneysMap", () => {
  it("разворачивает страны в плоский список городов с id места и координатами", () => {
    const response = mapResponse([
      country("RU", [{ placeId: MOSCOW_ID, latitude: 55.75, longitude: 37.62, years: [2020] }]),
      country("GB", [
        { placeId: LONDON_ID, latitude: 51.5, longitude: -0.12, years: [2021] },
        { placeId: BRISTOL_ID, latitude: 51.45, longitude: -2.58, years: [2019] },
      ]),
    ]);

    expect(citiesFromJourneysMap(response)).toEqual([
      { id: MOSCOW_ID, lat: 55.75, lng: 37.62 },
      { id: LONDON_ID, lat: 51.5, lng: -0.12 },
      { id: BRISTOL_ID, lat: 51.45, lng: -2.58 },
    ]);
  });

  it("город с тем же id места попадает в список один раз", () => {
    const response = mapResponse([
      country("RU", [{ placeId: MOSCOW_ID, latitude: 55.75, longitude: 37.62, years: [2020] }]),
      country("RU", [{ placeId: MOSCOW_ID, latitude: 55.75, longitude: 37.62, years: [2023] }]),
    ]);

    expect(citiesFromJourneysMap(response)).toEqual([{ id: MOSCOW_ID, lat: 55.75, lng: 37.62 }]);
  });

  it("разные места с одинаковыми координатами держит по отдельности", () => {
    const response = mapResponse([
      country("GB", [{ placeId: LONDON_ID, latitude: 51.5, longitude: -0.12, years: [2020] }]),
      country("GB", [{ placeId: BRISTOL_ID, latitude: 51.5, longitude: -0.12, years: [2021] }]),
    ]);

    expect(citiesFromJourneysMap(response)).toHaveLength(2);
  });

  it("пустой ввод даёт пустой список", () => {
    expect(citiesFromJourneysMap(mapResponse([]))).toEqual([]);
  });
});
