import { randomUUID } from "node:crypto";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Креды для UI-логина: одно поле identifier (username ИЛИ email) + пароль. */
export interface Credentials {
  readonly login: string;
  readonly password: string;
}

/** Полные данные зарегистрированного через API пользователя. */
export interface RegisteredUser {
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

const DEFAULT_PASSWORD = "e2e-Password-123";

/**
 * Генерирует уникальный username, устойчивый к параллельным воркерам.
 *
 * Тесты гоняются `fullyParallel` в нескольких процессах — `Date.now()` сам по себе
 * может совпасть по миллисекунде, поэтому добавляем случайный хвост из uuid.
 */
function uniqueUsername(): string {
  return `e2e_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/**
 * Генерирует данные нового пользователя БЕЗ обращения к API.
 *
 * Нужен там, где регистрация идёт через UI-форму (а не через бэкенд-сид) и тесту
 * требуется уникальный набор полей для ввода.
 *
 * Returns:
 *   Уникальные username/email и дефолтный пароль
 */
export function makeUserData(): RegisteredUser {
  const username = uniqueUsername();

  return { username, email: `${username}@example.com`, password: DEFAULT_PASSWORD };
}

/**
 * Регистрирует свежего пользователя через `/v1/auth/register/` и возвращает его данные.
 *
 * Уникальный логин на каждый вызов → тесты не зависят от состояния БД и идут параллельно.
 * Email остаётся неверифицированным — по контракту это не блокирует вход на `/home`.
 *
 * Args:
 *   request: APIRequestContext с baseURL из конфига (идёт через vite-прокси на backend)
 *
 * Returns:
 *   Данные созданного пользователя (username, email, password)
 */
export async function registerUser(request: APIRequestContext): Promise<RegisteredUser> {
  const user = makeUserData();

  const response = await request.post("/v1/auth/register/", {
    data: {
      username: user.username,
      email: user.email,
      password: user.password,
      terms_accepted: true,
      marketing_emails_consent: false,
    },
  });
  expect(response.ok(), `register failed: ${response.status()} ${await response.text()}`).toBeTruthy();

  return user;
}

/**
 * Проходит UI-логин: заполняет форму на `/login` и ждёт появления дашборда (`/home`).
 *
 * `exact: true` обязателен — `getByLabel` матчит подстроку без регистра, и "Password"
 * без него цепляет ещё и кнопку-глазик (aria-label "Toggle password visibility").
 *
 * Args:
 *   page: страница Playwright
 *   credentials: identifier (username или email) + пароль
 */
export async function loginViaUi(page: Page, credentials: Credentials): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username or email", { exact: true }).fill(credentials.login);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Log in" }).click();

  // Кнопка профиля живёт только на HomePage — её появление = успешный вход и редирект на `/home`.
  await expect(page.getByRole("button", { name: "Open profile menu" })).toBeVisible();
}

/**
 * Регистрирует свежего юзера через API и логинит его в UI по username.
 *
 * Удобно как precondition для тестов, которым нужна уже залогиненная страница,
 * но важна гибкость по таймингу (когда фикстуры `authedPage` мало).
 *
 * Args:
 *   page: страница Playwright
 *   request: APIRequestContext для сида юзера
 *
 * Returns:
 *   Данные залогиненного пользователя
 */
export async function registerAndLogin(page: Page, request: APIRequestContext): Promise<RegisteredUser> {
  const user = await registerUser(request);
  await loginViaUi(page, { login: user.username, password: user.password });

  return user;
}
