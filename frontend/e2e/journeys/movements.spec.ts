import { expect, test } from "../fixtures";
import { createJourney, findPlace } from "../helpers/journeys";
import { getStoredAccessToken } from "../helpers/session";

/**
 * E2E: карта перемещений (/journeys/movements) на реальных данных пользователя.
 *
 * Две поездки по API (Москва → Лондон самолётом в 2019, Лондон → Париж по суше в 2022) →
 * вкладка рисует по линии на маршрут. Фильтры меняют карту: вид транспорта уходит запросом на
 * бэк (`transportType`), окно лет применяется на клиенте — линия пропадает без запроса.
 * Покрывает цепочку create → БД → GET /movements → фильтры → рендер, которую unit/component
 * не достают (SQL-выборка и раскладка — реальные, jsdom их не видит).
 *
 * Язык интерфейса зафиксирован в playwright-конфиге (en), поэтому имена контролов — английские.
 */

test.describe("Journeys movements map", () => {
  test.beforeEach(async ({ authedPage, request }) => {
    const token = (await getStoredAccessToken(authedPage)) ?? "";
    expect(token, "после логина ожидается access-токен в sessionStorage").not.toBe("");

    const moscow = await findPlace(request, token, "Moscow");
    const london = await findPlace(request, token, "London");
    const paris = await findPlace(request, token, "Paris");
    await createJourney(request, token, {
      origin: moscow,
      destination: london,
      transportType: "air",
      traveledYear: 2019,
    });
    await createJourney(request, token, {
      origin: london,
      destination: paris,
      transportType: "land",
      traveledYear: 2022,
    });

    await authedPage.goto("/journeys/movements");
  });

  test("каждый маршрут рисуется линией, фильтр транспорта убирает лишний", async ({ authedPage }) => {
    const lines = authedPage.locator(".movement-line");
    await expect(lines).toHaveCount(2);

    // Выключаем самолёт: бэк возвращает только сухопутный маршрут.
    await authedPage.locator(".movements-controls__chip", { hasText: "Air" }).click();
    await expect(lines).toHaveCount(1);

    // Без выбранного транспорта (по умолчанию включены все три вида) карта пуста и подсказывает
    // выбрать хотя бы один.
    await authedPage.locator(".movements-controls__chip", { hasText: "Land" }).click();
    await authedPage.locator(".movements-controls__chip", { hasText: "Water" }).click();
    await expect(lines).toHaveCount(0);
    await expect(authedPage.getByText("Choose at least one transport")).toBeVisible();
  });

  test("окно лет скрывает поездки вне окна", async ({ authedPage }) => {
    const lines = authedPage.locator(".movement-line");
    await expect(lines).toHaveCount(2);

    // Начало окна — 2022: поездка 2019 выпадает из него.
    await authedPage.getByRole("button", { name: "From year" }).click();
    await authedPage.getByRole("textbox", { name: "From year" }).fill("2022");
    await authedPage.getByRole("textbox", { name: "From year" }).press("Enter");

    await expect(lines).toHaveCount(1);
  });
});
