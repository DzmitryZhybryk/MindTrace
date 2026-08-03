import { beforeEach, describe, expect, it, vi } from "vitest";

import { getJourneysMap } from "../../api/journeys";
import type { MapCountry } from "../WorldMap";
import { citiesFromJourneysMap, clearUserCitiesCache, getCachedUserCities, loadUserCities } from "./userCities";

// Кэш звонит в getJourneysMap (сетевой боундари вертикали) — мокаем именно его: тестируем
// логику кэша (звонок один раз, ключ по sub, сброс), а не сеть/zod (они покрыты отдельно).
vi.mock("../../api/journeys", () => ({ getJourneysMap: vi.fn() }));
const getJourneysMapMock = vi.mocked(getJourneysMap);

/** Строит страну карты с одним городом (лишние поля агрегата тут не важны). */
function country(id: string, cities: MapCountry["cities"]): MapCountry {
  return { id, status: "visited", cities };
}

beforeEach(() => {
  // Кэш живёт на модуле — сбрасываем, чтобы города не протекали между тестами.
  clearUserCitiesCache();
  getJourneysMapMock.mockReset();
});

describe("citiesFromJourneysMap", () => {
  it("разворачивает страны в плоский список городов с именем и координатами", () => {
    const countries = [
      country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }]),
      country("GB", [
        { name: "London", lat: 51.5, lng: -0.12, years: [2021] },
        { name: "Bristol", lat: 51.45, lng: -2.58, years: [2019] },
      ]),
    ];

    expect(citiesFromJourneysMap(countries)).toEqual([
      { name: "Moscow", lat: 55.75, lng: 37.62 },
      { name: "London", lat: 51.5, lng: -0.12 },
      { name: "Bristol", lat: 51.45, lng: -2.58 },
    ]);
  });

  it("дедуплицирует города с одинаковым именем и координатами", () => {
    const countries = [
      country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }]),
      country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2023] }]),
    ];

    expect(citiesFromJourneysMap(countries)).toEqual([{ name: "Moscow", lat: 55.75, lng: 37.62 }]);
  });

  it("тёзок с разными координатами держит по отдельности", () => {
    const countries = [
      country("US", [{ name: "Springfield", lat: 39.8, lng: -89.64, years: [2020] }]),
      country("US", [{ name: "Springfield", lat: 42.1, lng: -72.59, years: [2021] }]),
    ];

    expect(citiesFromJourneysMap(countries)).toHaveLength(2);
  });

  it("пустой ввод даёт пустой список", () => {
    expect(citiesFromJourneysMap([])).toEqual([]);
  });
});

describe("loadUserCities / кэш по sub", () => {
  it("кэширует результат по sub — повторный вызов не бьёт в getJourneysMap", async () => {
    getJourneysMapMock.mockResolvedValue([country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }])]);

    const first = await loadUserCities("user-1");
    const second = await loadUserCities("user-1");

    expect(first).toEqual([{ name: "Moscow", lat: 55.75, lng: 37.62 }]);
    expect(second).toEqual(first);
    expect(getJourneysMapMock).toHaveBeenCalledOnce();
  });

  it("getCachedUserCities возвращает null до загрузки и города после", async () => {
    getJourneysMapMock.mockResolvedValue([country("GB", [{ name: "London", lat: 51.5, lng: -0.12, years: [2021] }])]);

    expect(getCachedUserCities("user-1")).toBeNull();

    await loadUserCities("user-1");

    expect(getCachedUserCities("user-1")).toEqual([{ name: "London", lat: 51.5, lng: -0.12 }]);
  });

  it("clearUserCitiesCache сбрасывает — следующий load бьёт в сеть заново", async () => {
    getJourneysMapMock.mockResolvedValue([country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }])]);

    await loadUserCities("user-1");
    clearUserCitiesCache();
    await loadUserCities("user-1");

    expect(getJourneysMapMock).toHaveBeenCalledTimes(2);
  });

  it("смена sub промахивается мимо кэша и рефетчит", async () => {
    getJourneysMapMock.mockResolvedValue([country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }])]);

    await loadUserCities("user-1");
    await loadUserCities("user-2");

    expect(getJourneysMapMock).toHaveBeenCalledTimes(2);
    // Кэш держит только последний sub — по прежнему промах.
    expect(getCachedUserCities("user-1")).toBeNull();
  });

  it("одновременные вызовы для одного sub дедуплицируются в один запрос", async () => {
    let resolveMap: (countries: MapCountry[]) => void = () => {};
    getJourneysMapMock.mockReturnValue(
      new Promise<MapCountry[]>((resolve) => {
        resolveMap = resolve;
      }),
    );

    const inFlightA = loadUserCities("user-1");
    const inFlightB = loadUserCities("user-1");
    resolveMap([country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }])]);
    await Promise.all([inFlightA, inFlightB]);

    expect(getJourneysMapMock).toHaveBeenCalledOnce();
  });

  it("ошибка сбрасывает in-flight — следующий вызов пробует снова", async () => {
    getJourneysMapMock.mockRejectedValueOnce(new Error("network"));
    getJourneysMapMock.mockResolvedValueOnce([
      country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }]),
    ]);

    await expect(loadUserCities("user-1")).rejects.toThrow("network");
    const retried = await loadUserCities("user-1");

    expect(retried).toEqual([{ name: "Moscow", lat: 55.75, lng: 37.62 }]);
    expect(getJourneysMapMock).toHaveBeenCalledTimes(2);
  });

  it("запрос, завершившийся после clearUserCitiesCache, не воскрешает кэш (логаут в полёте)", async () => {
    let resolveMap: (countries: MapCountry[]) => void = () => {};
    getJourneysMapMock.mockReturnValue(
      new Promise<MapCountry[]>((resolve) => {
        resolveMap = resolve;
      }),
    );

    const inFlight = loadUserCities("user-1");
    clearUserCitiesCache(); // логаут, пока запрос ещё в полёте
    resolveMap([country("RU", [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020] }])]);
    await inFlight;

    // Устаревший `.then` не записал кэш — инвариант «логаут чистит» соблюдён.
    expect(getCachedUserCities("user-1")).toBeNull();
  });
});
