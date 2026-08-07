import { expect, test } from "@playwright/test";

import { loginViaUi, registerUser } from "../helpers/users";

/**
 * E2E: app-global глобус-фон — грань хоста следует за маршрутом (перелёт login→home).
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
});
