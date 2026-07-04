import { expect, test } from "../fixtures";
import { getStoredAccessToken } from "../helpers/session";

/**
 * E2E: карта путешествий на реальных данных пользователя (фича DEV-36).
 *
 * Сквозной путь: создаём поездку через API (payload-on-create — снапшот мест, справочник geo
 * не задействован) → открываем индексную вкладку /journeys → карта тянет агрегат с бэка и рисует
 * посещённые города точками. Покрывает цепочку create → БД → GET /map → рендер, которую
 * unit/component не достают.
 *
 * sessionStorage-токен-флоу → идёт и на webkit: goto same-origin сохраняет access-токен, а с
 * токеном в sessionStorage AuthContext не бутстрапит через refresh-cookie (см. isBootstrapping),
 * поэтому Secure-cookie-по-http-ограничение webkit тут ни при чём — skip не нужен.
 */
test.describe("Journeys map", () => {
  test("посещённая поездка появляется точками-городами на карте", async ({ authedPage, request }) => {
    const token = await getStoredAccessToken(authedPage);
    expect(token, "после логина ожидается access-токен в sessionStorage").not.toBeNull();

    const created = await request.post("/v1/journeys/", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        origin: { name: "Moscow", countryCode: "RU", latitude: 55.75, longitude: 37.62 },
        destination: { name: "London", countryCode: "GB", latitude: 51.5, longitude: -0.12 },
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
