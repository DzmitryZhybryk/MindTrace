import { expect, test } from "../fixtures";
import { getRefreshCookie, WEBKIT_SECURE_COOKIE_REASON } from "../helpers/session";

/**
 * E2E: logout по флоу C.
 *
 * Real-stack: реальный `POST /v1/auth/logout/` (204) чистит и серверную HttpOnly-cookie,
 * и локальный токен. Наличие пункта меню (C1) косвенно проверяется тем, что мы по нему кликаем.
 */
test.describe("Logout", () => {
  test("logout из меню профиля ведёт на /login и чистит сессию", async ({ authedPage, context, browserName }) => {
    test.skip(browserName === "webkit", WEBKIT_SECURE_COOKIE_REASON);

    // refresh-cookie выставлена при логине — фиксируем «до», чтобы ассерт «после» был осмысленным.
    expect(await getRefreshCookie(context)).toBeDefined();

    await authedPage.getByRole("button", { name: "Open profile menu" }).click();
    await authedPage.getByRole("menuitem", { name: "Logout" }).click();

    await expect(authedPage).toHaveURL(/\/login$/u);

    const accessToken = await authedPage.evaluate(() => window.sessionStorage.getItem("access_token"));
    expect(accessToken).toBeNull();
    expect(await getRefreshCookie(context)).toBeUndefined();
  });

  test("logout идемпотентен офлайн — локально чистит сессию и ведёт на /login", async ({ authedPage, context }) => {
    // Сеть отключена: серверный logout не дойдёт, но catch на фронте всё равно
    // чистит токен локально и навигирует на /login (идемпотентность).
    await context.setOffline(true);

    await authedPage.getByRole("button", { name: "Open profile menu" }).click();
    await authedPage.getByRole("menuitem", { name: "Logout" }).click();

    await expect(authedPage).toHaveURL(/\/login$/u);

    const accessToken = await authedPage.evaluate(() => window.sessionStorage.getItem("access_token"));
    expect(accessToken).toBeNull();

    await context.setOffline(false);
  });
});
