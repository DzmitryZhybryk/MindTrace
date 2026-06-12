import { expect, test } from "@playwright/test";

import { makeUserData } from "../helpers/users";

/**
 * E2E: sign-up happy-path по флоу A из `.claude/.test-plan.md` (пункт A3).
 *
 * Регистрация идёт через реальную UI-форму (а не через бэкенд-сид) — это и есть
 * смысл теста: проверить полный путь «заполнил форму → 201 → редирект на `/` →
 * токен сессии сохранён». Уникальный юзер на прогон, чтобы не зависеть от БД.
 *
 * Микровалидация полей (A2) и конфликты 409 (L) покрыты компонентным
 * `SignUpPage.test.tsx` — здесь не дублируем.
 */
test.describe("Sign up", () => {
  test("валидная регистрация ведёт на главную и сохраняет токен сессии", async ({ page }) => {
    const { username, email, password } = makeUserData();

    await page.goto("/signup");
    // exact: getByLabel матчит подстроку без регистра — без него "Password" цепляет
    // ещё и кнопку-глазик (aria-label "Toggle password visibility").
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    // Кнопка "Create account" disabled, пока не принято соглашение.
    await page.getByRole("checkbox", { name: /I agree to the/u }).check();
    await page.getByRole("button", { name: "Create account" }).click();

    // Кнопка профиля живёт только на HomePage — её появление = успешная регистрация и редирект на `/`.
    await expect(page.getByRole("button", { name: "Open profile menu" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/u);

    // Access-токен сохранён в sessionStorage (refresh — в HttpOnly-cookie, её проверяет блок K).
    const accessToken = await page.evaluate(() => window.sessionStorage.getItem("access_token"));
    expect(accessToken).not.toBeNull();
  });
});
