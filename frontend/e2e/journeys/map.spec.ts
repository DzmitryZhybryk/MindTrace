import { expect, test } from "../fixtures";
import { findPlace } from "../helpers/journeys";
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
