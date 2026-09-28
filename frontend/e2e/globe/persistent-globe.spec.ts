import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { loginViaUi, registerUser } from "../helpers/users";

async function hitsGlobeAtCenter(page: Page, locator: Locator): Promise<boolean> {
  await expect(locator, `${locator} должен быть подключён к DOM для проверки центра`).toBeAttached();
  // Пустой flex-слот может иметь нулевую ширину: для его центра достаточно высоты.
  await expect
    .poll(async () => (await locator.boundingBox())?.height ?? 0, {
      message: `${locator} должен иметь положительную высоту для проверки центра`,
    })
    .toBeGreaterThan(0);
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Не удалось определить boundingBox для ${locator}`);
  }

  return page.evaluate(
    ([x, y]) => (document.elementFromPoint(x, y)?.closest(".persistent-globe") ?? null) !== null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

/**
 * E2E: app-global глобус-фон — грань хоста следует за маршрутом (перелёт login→home,
 * форма поездки→home).
 *
 * Проверка структурная (по data-атрибутам `.persistent-globe`), сознательно БЕЗ завязки на
 * WebGL/canvas: CSS-слой хоста (кадрирование + скрим) обязан жить и там, где WebGL недоступен
 * (headless-браузер без GPU), — сбой холста изолирует boundary внутри самого хоста.
 */
test.describe("Persistent globe", () => {
  test("грань хоста следует за маршрутом: login до входа, home после", async ({ page, request }) => {
    const { username, password } = await registerUser(request);
    const globe = page.locator(".persistent-globe");

    // Публичная грань: на /login хост смонтирован и кадрирован под форму логина.
    await page.goto("/login");
    await expect(globe).toHaveAttribute("data-screen", "login");
    await expect(globe).toHaveAttribute("data-visible", "true");

    // После входа хост НЕ размонтируется — та же нода переключает грань на дашбордную.
    await loginViaUi(page, { login: username, password });
    await expect(globe).toHaveAttribute("data-screen", "home");
    await expect(globe).toHaveAttribute("data-visible", "true");
  });

  test("форма поездки — грань того же глобуса: уход на дашборд перелетает, а не пересоздаёт его", async ({
    authedPage,
  }) => {
    const globe = authedPage.locator(".persistent-globe");

    // Десктопный вьюпорт проектов (≥992px): колонка глобуса у формы видима, грань — своя.
    await authedPage.goto("/journeys/add");
    await expect(globe).toHaveAttribute("data-screen", "journeyAdd");
    await expect(globe).toHaveAttribute("data-visible", "true");
    const hostNode = await globe.elementHandle();

    await authedPage.getByRole("link", { name: "MyJourney" }).click();

    await expect(globe).toHaveAttribute("data-screen", "home");
    await expect(globe).toHaveAttribute("data-visible", "true");
    // Та же DOM-нода, что и на форме: WebGL не перезагружался — отсюда и перелёт.
    expect(await hostNode?.evaluate((node) => node.isConnected)).toBe(true);
  });

  test("дашборд пропускает события через слот к глобусу, а шапка сохраняет их", async ({ authedPage }) => {
    const globe = authedPage.locator(".persistent-globe");

    await authedPage.goto("/home");
    await expect(globe, "На /home глобус должен переключиться на грань home").toHaveAttribute("data-screen", "home");
    await expect(globe, "На /home глобус должен принимать события указателя").toHaveAttribute("data-interactive", "true");

    expect(
      await hitsGlobeAtCenter(authedPage, authedPage.locator(".home-stage")),
      "Центр слота дашборда должен пропускать события к .persistent-globe",
    ).toBe(true);
    expect(
      await hitsGlobeAtCenter(authedPage, authedPage.getByRole("link", { name: "MyJourney" })),
      "Ссылка MyJourney в шапке должна сохранять события, не пропуская их к глобусу",
    ).toBe(false);
  });

  test("форма поездки пропускает события через слот к глобусу, а заголовок сохраняет их", async ({ authedPage }) => {
    const globe = authedPage.locator(".persistent-globe");

    await authedPage.goto("/journeys/add");
    await expect(globe, "На /journeys/add глобус должен переключиться на грань journeyAdd").toHaveAttribute(
      "data-screen",
      "journeyAdd",
    );
    await expect(globe, "На /journeys/add глобус должен принимать события указателя").toHaveAttribute(
      "data-interactive",
      "true",
    );

    expect(
      await hitsGlobeAtCenter(authedPage, authedPage.locator(".add-journey__globe-col")),
      "Центр колонки глобуса на форме поездки должен пропускать события к .persistent-globe",
    ).toBe(true);
    expect(
      await hitsGlobeAtCenter(authedPage, authedPage.getByRole("heading", { level: 1, name: "New journey" })),
      "Заголовок New journey должен сохранять события в колонке формы, не пропуская их к глобусу",
    ).toBe(false);
  });
});
