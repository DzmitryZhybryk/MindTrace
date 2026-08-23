import { describe, expect, it } from "vitest";

import type { JourneysMapResponse, MapCityResponse, MapCountryResponse } from "../../api/sdk";
import { citiesFromJourneysMap } from "./userCities";

/** Строит страну карты с одним городом (лишние поля агрегата тут не важны). */
function country(countryCode: string, cities: MapCityResponse[]): MapCountryResponse {
  return { countryCode, cities };
}

/** Ответ /v1/journeys/map с заданными странами — то, что SDK отдаёт в `select`. */
function mapResponse(countries: MapCountryResponse[]): JourneysMapResponse {
  return { countries };
}

describe("citiesFromJourneysMap", () => {
  it("разворачивает страны в плоский список городов с именем и координатами", () => {
    const response = mapResponse([
      country("RU", [{ name: "Moscow", latitude: 55.75, longitude: 37.62, years: [2020] }]),
      country("GB", [
        { name: "London", latitude: 51.5, longitude: -0.12, years: [2021] },
        { name: "Bristol", latitude: 51.45, longitude: -2.58, years: [2019] },
      ]),
    ]);

    expect(citiesFromJourneysMap(response)).toEqual([
      { name: "Moscow", lat: 55.75, lng: 37.62 },
      { name: "London", lat: 51.5, lng: -0.12 },
      { name: "Bristol", lat: 51.45, lng: -2.58 },
    ]);
  });

  it("дедуплицирует города с одинаковым именем и координатами", () => {
    const response = mapResponse([
      country("RU", [{ name: "Moscow", latitude: 55.75, longitude: 37.62, years: [2020] }]),
      country("RU", [{ name: "Moscow", latitude: 55.75, longitude: 37.62, years: [2023] }]),
    ]);

    expect(citiesFromJourneysMap(response)).toEqual([{ name: "Moscow", lat: 55.75, lng: 37.62 }]);
  });

  it("тёзок с разными координатами держит по отдельности", () => {
    const response = mapResponse([
      country("US", [{ name: "Springfield", latitude: 39.8, longitude: -89.64, years: [2020] }]),
      country("US", [{ name: "Springfield", latitude: 42.1, longitude: -72.59, years: [2021] }]),
    ]);

    expect(citiesFromJourneysMap(response)).toHaveLength(2);
  });

  it("пустой ввод даёт пустой список", () => {
    expect(citiesFromJourneysMap(mapResponse([]))).toEqual([]);
  });
});
