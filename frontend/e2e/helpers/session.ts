import type { BrowserContext, Page } from "@playwright/test";

/** Один элемент из `context.cookies()` (Playwright не экспортирует тип под именем напрямую). */
type Cookie = Awaited<ReturnType<BrowserContext["cookies"]>>[number];

/** Ключ, под которым SPA хранит access-токен (см. src/auth/tokenStore.ts). */
const ACCESS_TOKEN_KEY = "access_token";

/** Имя HttpOnly-cookie с refresh-токеном (см. backend cookies.py). */
const REFRESH_COOKIE_NAME = "refresh_token";

/**
 * Причина пропуска cookie-зависимых тестов на WebKit.
 *
 * refresh-cookie выставлена с `Secure`, а dev/test-стек крутится по http://localhost.
 * Chromium/Firefox считают localhost secure-контекстом и хранят такую cookie по http, а
 * WebKit (Safari) — отвергает Secure-cookie по http даже на localhost. Поэтому refresh из
 * cookie / bootstrap / атрибуты cookie на webkit против http-стека недоступны (в проде по
 * https — работали бы). Остальные флоу (на sessionStorage-токене) на webkit идут штатно.
 */
export const WEBKIT_SECURE_COOKIE_REASON =
  "WebKit отвергает Secure-cookie по http://localhost — refresh/bootstrap-флоу недоступен против http-стека (нужен https)";

/**
 * Возвращает refresh-cookie контекста или undefined, если её нет.
 *
 * refresh-cookie — HttpOnly, поэтому через `document.cookie` не видна; читать только так.
 *
 * Args:
 *   context: browser-context Playwright
 *
 * Returns:
 *   Cookie-объект `refresh_token` или undefined
 */
export async function getRefreshCookie(context: BrowserContext): Promise<Cookie | undefined> {
  const cookies = await context.cookies();

  return cookies.find((cookie) => cookie.name === REFRESH_COOKIE_NAME);
}

/**
 * Очищает sessionStorage страницы — имитация «access-токен потерян, refresh-cookie жива».
 *
 * Args:
 *   page: страница Playwright
 */
export async function clearSessionStorage(page: Page): Promise<void> {
  await page.evaluate(() => window.sessionStorage.clear());
}

/**
 * Удаляет все cookies контекста — имитация «refresh-cookie протухла/удалена».
 *
 * Args:
 *   context: browser-context Playwright
 */
export async function clearCookies(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

/**
 * Читает access-токен из sessionStorage (null, если его нет).
 *
 * Args:
 *   page: страница Playwright
 *
 * Returns:
 *   Значение токена или null
 */
export async function getStoredAccessToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.sessionStorage.getItem(key), ACCESS_TOKEN_KEY);
}

/**
 * Подменяет access-токен в sessionStorage на произвольное значение.
 *
 * tokenStore читает токен memory-first → правка применится только после `page.reload()`.
 * Зови reload после, если SPA должен подхватить подменённый токен.
 *
 * Args:
 *   page: страница Playwright
 *   token: значение, которое надо записать
 */
export async function setStoredAccessToken(page: Page, token: string): Promise<void> {
  await page.evaluate(([key, value]) => window.sessionStorage.setItem(key, value), [ACCESS_TOKEN_KEY, token] as const);
}
