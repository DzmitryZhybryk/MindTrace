import { expect, test } from "@playwright/test";

import { loginViaUi, registerUser } from "../helpers/users";

/**
 * E2E: login happy-path по флоу B.
 *
 * Тест-юзер сидится через backend API (свежий уникальный логин на каждый прогон),
 * чтобы не зависеть от состояния БД и не связывать login-тест с UI регистрации.
 * Email остаётся неверифицированным — по контракту это не блокирует вход на `/home`.
 */
test.describe("Login", () => {
  test("валидный логин ведёт на дашборд и показывает меню профиля", async ({ page, request }) => {
    const { username, password } = await registerUser(request);

    await page.goto("/login");
    // exact: getByLabel матчит подстроку без регистра — без него "Password" цепляет
    // ещё и кнопку-глазик (aria-label "Toggle password visibility").
    await page.getByLabel("Username or email", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in" }).click();

    // Кнопка профиля живёт только на HomePage — её появление = успешный вход и редирект на `/home`.
    await expect(page.getByRole("button", { name: "Open profile menu" })).toBeVisible();
    await expect(page).toHaveURL(/\/home$/u);
    // Глобус-фон дашборда — отдельный флоу: e2e/globe/persistent-globe.spec.ts.
  });

  test("логин по email (а не только username) ведёт на дашборд", async ({ page, request }) => {
    // Одно поле identifier принимает и username, и email — бэк сам резолвит. Здесь проверяем email;
    // вход по username покрыт тестом выше. loginViaUi сам ждёт появления кнопки профиля.
    const { email, password } = await registerUser(request);

    await loginViaUi(page, { login: email, password });

    await expect(page).toHaveURL(/\/home$/u);
  });
});
