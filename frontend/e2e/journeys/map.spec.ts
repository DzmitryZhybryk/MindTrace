import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "../fixtures";
import { getStoredAccessToken } from "../helpers/session";

/**
 * E2E: карта путешествий на реальных данных пользователя (фича DEV-36).
 *
 * Сквозной путь: находим места через поиск geo → создаём поездку через API по их id (бэк
 * проверяет, что места существуют) → открываем индексную вкладку /journeys → карта тянет
 * агрегат с бэка, рисует посещённые города точками и подписывает их названиями из geo.
 * Покрывает цепочку search → create → БД → GET /map → resolve → рендер, которую
 * unit/component не достают.
 *
 * sessionStorage-токен-флоу → идёт и на webkit: goto same-origin сохраняет access-токен, а с
 * токеном в sessionStorage AuthContext не бутстрапит через refresh-cookie (см. isBootstrapping),
 * поэтому Secure-cookie-по-http-ограничение webkit тут ни при чём — skip не нужен.
 */

type PlaceRef = { placeId: string; countryCode: string; latitude: number; longitude: number };

/** Находит город через поиск geo и отдаёт его в форме, которую принимает создание поездки. */
async function findPlace(request: APIRequestContext, token: string, searchText: string): Promise<PlaceRef> {
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

test.describe("Journeys map", () => {
  test("посещённая поездка появляется точками-городами на карте", async ({ authedPage, request }) => {
    const token = await getStoredAccessToken(authedPage);
    expect(token, "после логина ожидается access-токен в sessionStorage").not.toBeNull();
    const bearer = token ?? "";

    const created = await request.post("/v1/journeys/", {
      headers: { Authorization: `Bearer ${bearer}` },
      data: {
        origin: await findPlace(request, bearer, "Moscow"),
        destination: await findPlace(request, bearer, "London"),
        transportType: "air",
        traveledYear: 2020,
        traveledMonth: null,
        traveledDay: null,
      },
    });
    expect(created.ok(), `create journey failed: ${created.status()} ${await created.text()}`).toBeTruthy();

    await authedPage.goto("/journeys");

    // Карта отрисована, а поездка (origin+destination) осела двумя точками-городами:
    // данные реально прошли путь create → GET /map → рендер.
    await expect(authedPage.locator("svg.world-map")).toBeVisible();
    await expect(authedPage.locator(".world-map__city-dot")).toHaveCount(2);
  });
});
