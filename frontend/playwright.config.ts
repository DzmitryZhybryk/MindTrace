import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e-конфиг.
 *
 * Тесты гоняются против поднятого стека (`docker compose up -d` из корня репозитория):
 * frontend на :5173 проксирует `/v1` на backend. Поэтому здесь НЕТ `webServer` —
 * стек внешний, его жизненный цикл не на Playwright.
 *
 * baseURL переопределяется через E2E_BASE_URL (напр. для CI против другого хоста).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Бэкенд argon2-хеширует пароль на каждом register/login (~50ms+). При полной
  // параллельности это насыщает CPU, и часть логинов не укладывается в дефолтный
  // 5s expect-таймаут. Капаем воркеров и даём ассертам запас по времени.
  workers: process.env.CI ? 2 : 4,
  expect: { timeout: 15000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    // Фиксируем язык: i18next-детектор без localStorage падает на navigator.language,
    // en-US нормализуется до `en` → лейблы форм совпадают с локаторами теста.
    locale: "en-US",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // WebKit в матрице, но cookie-зависимые тесты на нём точечно пропущены: WebKit отвергает
  // `Secure`-cookie по http://localhost (Chromium/Firefox — хранят), поэтому refresh из
  // cookie / bootstrap / атрибуты cookie против http-стека на webkit недоступны (в проде по
  // https — работали бы). См. `test.skip(browserName === "webkit", WEBKIT_SECURE_COOKIE_REASON)`
  // в спеках. Остальные флоу (на sessionStorage-токене) на webkit гоняются штатно.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
