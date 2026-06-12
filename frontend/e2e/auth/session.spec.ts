import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";
import { clearCookies, clearSessionStorage, getRefreshCookie, WEBKIT_SECURE_COOKIE_REASON } from "../helpers/session";

/**
 * E2E: жизненный цикл сессии — флоу D (ProtectedRoute + bootstrap-refresh) и K (атрибуты
 * refresh-cookie) из `.claude/.test-plan.md`.
 *
 * Это ровно та real-stack интеграция, которую MSW-компонентные тесты не достают: настоящая
 * HttpOnly refresh-cookie и реальный bootstrap-refresh при перезагрузке/новой вкладке. Логика
 * рендера ProtectedRoute покрыта `ProtectedRoute.test.tsx`.
 *
 * E1 (single-flight на 401 при защищённом действии) сознательно НЕ в e2e: его логика
 * исчерпывающе и детерминированно покрыта `api/client.test.ts` (включая «один /refresh/ на
 * параллельные вызовы»), а единственный authed-UI-триггер (send-verification) завязан на
 * resend-cooldown от авто-challenge регистрации → флак. Реальную rotation refresh-токена
 * против бэка гоняет D2.
 */

const REFRESH_URL = "/v1/auth/refresh/";
const PROFILE_BUTTON_NAME = "Open profile menu";

/** Навешивает счётчик POST `/refresh/` на страницу; возвращает массив URL'ов. */
function trackRefreshRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(REFRESH_URL)) {
      requests.push(request.url());
    }
  });

  return requests;
}

test.describe("Session lifecycle", () => {
  test("D1: reload сохраняет сессию — остаёмся на /", async ({ authedPage }) => {
    await authedPage.reload();

    await expect(authedPage.getByRole("button", { name: PROFILE_BUTTON_NAME })).toBeVisible();
    await expect(authedPage).toHaveURL(/\/$/u);
  });

  test("D2: потеря access-токена → reload → bootstrap-refresh из cookie, ровно один /refresh/", async ({
    authedPage,
    browserName,
  }) => {
    test.skip(browserName === "webkit", WEBKIT_SECURE_COOKIE_REASON);

    // Чистим только sessionStorage — refresh-cookie жива. На reload bootstrap видит «токена нет»
    // и поднимает сессию из cookie. StrictMode дважды дёргает эффект → single-flight даёт ОДИН /refresh/.
    await clearSessionStorage(authedPage);
    const refreshRequests = trackRefreshRequests(authedPage);

    await authedPage.reload();

    await expect(authedPage.getByRole("button", { name: PROFILE_BUTTON_NAME })).toBeVisible();
    await expect(authedPage).toHaveURL(/\/$/u);
    expect(refreshRequests).toHaveLength(1);
  });

  test("D3: потеря и токена, и cookie → reload → редирект на /login", async ({ authedPage, context }) => {
    await clearSessionStorage(authedPage);
    await clearCookies(context);

    await authedPage.reload();

    await expect(authedPage).toHaveURL(/\/login$/u);
  });

  test("D4: новая вкладка с живой cookie → bootstrap → /", async ({ authedPage, context, browserName }) => {
    test.skip(browserName === "webkit", WEBKIT_SECURE_COOKIE_REASON);

    // authedPage уже залогинен → refresh-cookie живёт в контексте. У новой вкладки свой
    // sessionStorage (без токена), но cookie общая → bootstrap-refresh поднимает сессию.
    await expect(authedPage).toHaveURL(/\/$/u);

    const newTab = await context.newPage();
    await newTab.goto("/");

    await expect(newTab.getByRole("button", { name: PROFILE_BUTTON_NAME })).toBeVisible();
    await expect(newTab).toHaveURL(/\/$/u);

    await newTab.close();
  });

  test("D5: без токена и cookie → редирект на /login", async ({ page }) => {
    // Свежий контекст без авторизации — ProtectedRoute уводит на /login.
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/u);
  });

  test("K: refresh-cookie HttpOnly + SameSite=Lax + Secure, хранится на http://localhost", async ({
    authedPage,
    context,
    browserName,
  }) => {
    test.skip(browserName === "webkit", WEBKIT_SECURE_COOKIE_REASON);

    // authedPage гарантирует прошедший логин → cookie выставлена.
    await expect(authedPage).toHaveURL(/\/$/u);

    const refreshCookie = await getRefreshCookie(context);

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.sameSite).toBe("Lax");
    // Secure=true, но cookie всё равно сохранена на http://localhost (localhost = secure context) — это K3.
    expect(refreshCookie?.secure).toBe(true);
  });
});
