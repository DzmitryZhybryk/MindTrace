import { expect, test } from "../fixtures";
import { loginViaUi, registerUser } from "../helpers/users";

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
});
