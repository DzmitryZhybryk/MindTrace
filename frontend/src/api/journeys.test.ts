import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { clearAccessToken } from "../auth/tokenStore";
import { getJourneysMap, TRANSPORT_TYPES } from "./journeys";

type FetchSignature = (input: string, init?: RequestInit) => Promise<Response>;

/** 200-ответ с JSON-телом для стаба `fetch` (unit минует MSW — см. client.test.ts). */
function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("TransportType-контракт", () => {
  it("публикует ровно backend-набор {land, air, water}", () => {
    // Зеркало backend tests/api/journeys/test_transport_type_contract.py: обе стороны
    // пиннят один литерал. Разъедется домен → один из двух тестов краснеет и напоминает
    // синхронизировать вторую сторону (тут — union + иконки + подписи локалей).
    expect([...TRANSPORT_TYPES].sort()).toEqual(["air", "land", "water"]);
  });
});

describe("getJourneysMap", () => {
  let fetchMock: ReturnType<typeof vi.fn<FetchSignature>>;

  beforeEach(() => {
    clearAccessToken();
    sessionStorage.clear();
    fetchMock = vi.fn<FetchSignature>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("адаптирует ответ в форму WorldMap: countryCode→id, latitude/longitude→lat/lng, status=visited", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        countries: [
          { countryCode: "RU", cities: [{ name: "Moscow", latitude: 55.75, longitude: 37.62, years: [2020, 2022] }] },
        ],
      }),
    );

    const result = await getJourneysMap();

    expect(result).toEqual([
      { id: "RU", status: "visited", cities: [{ name: "Moscow", lat: 55.75, lng: 37.62, years: [2020, 2022] }] },
    ]);
  });

  it("возвращает пустой массив, когда посещённых стран нет", async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ countries: [] }));

    expect(await getJourneysMap()).toEqual([]);
  });

  it("бросает на невалидном ответе (координата не число) — fail fast на HTTP-границе", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        countries: [
          { countryCode: "RU", cities: [{ name: "Moscow", latitude: "nope", longitude: 37.62, years: [2020] }] },
        ],
      }),
    );

    await expect(getJourneysMap()).rejects.toThrow(ZodError);
  });
});
