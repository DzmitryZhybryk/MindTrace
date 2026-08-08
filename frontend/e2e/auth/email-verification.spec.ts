import { expect, test } from "../fixtures";
import { WEBKIT_SECURE_COOKIE_REASON } from "../helpers/session";

/**
 * E2E: напоминание о верификации email (блок F) — real-stack
 * срез, который MSW-компонентные тесты не достают.
 *
 * `EmailVerificationBanner.test.tsx` уже кроет рендер/dismiss в одном jsdom-контексте. Здесь —
 * только то, что требует настоящего браузера и бэка: реальный JWT с `email_verified=false`
 * поднимает баннер, а dismiss живёт в sessionStorage конкретной вкладки (переживает reload,
 * но не виден в новой вкладке).
 *
 * Успешная верификация (ввод кода → 204 → баннер исчезает, F6/G3) сознательно НЕ в e2e: код
 * хранится Argon2-хешем (недостижим), а сам флоу покрыт `VerifyEmailDialog.test.tsx`. По той же
 * причине (resend-cooldown от авто-challenge регистрации) тут нет «Send code → stage 2».
 */

const BANNER_NAME = "Email verification reminder";
const PROFILE_BUTTON_NAME = "Open profile menu";
const DISMISS_BUTTON_NAME = "Dismiss reminder for this session";

test.describe("Email verification banner", () => {
  test("F1: после реальной регистрации (email не верифицирован) баннер виден", async ({ authedPage }) => {
    // Настоящий бэкенд выдаёт токен с email_verified=false → AuthContext поднимает баннер.
    await expect(authedPage.getByRole("region", { name: BANNER_NAME })).toBeVisible();
  });

  test("F4: dismiss (×) скрывает баннер и переживает reload той же вкладки", async ({ authedPage }) => {
    const banner = authedPage.getByRole("region", { name: BANNER_NAME });
    await expect(banner).toBeVisible();

    await authedPage.getByRole("button", { name: DISMISS_BUTTON_NAME }).click();
    await expect(banner).toBeHidden();

    // sessionStorage переживает reload вкладки, а bootstrap-refresh не считается «логином»
    // (флаг dismiss не сбрасывается) → баннер остаётся скрыт.
    await authedPage.reload();
    await expect(authedPage.getByRole("button", { name: PROFILE_BUTTON_NAME })).toBeVisible();
    await expect(authedPage.getByRole("region", { name: BANNER_NAME })).toBeHidden();
  });

  test("F5: в новой вкладке баннер снова виден — dismiss живёт в sessionStorage вкладки", async ({
    authedPage,
    context,
    browserName,
  }) => {
    // Новая вкладка поднимает сессию из refresh-cookie (bootstrap) — на webkit cookie по http
    // недоступна, поэтому тест пропускается (см. WEBKIT_SECURE_COOKIE_REASON).
    test.skip(browserName === "webkit", WEBKIT_SECURE_COOKIE_REASON);

    // Вкладка 1: скрываем баннер.
    await authedPage.getByRole("button", { name: DISMISS_BUTTON_NAME }).click();
    await expect(authedPage.getByRole("region", { name: BANNER_NAME })).toBeHidden();

    // Новая вкладка: cookie общая (bootstrap поднимает сессию), но sessionStorage свой,
    // флага dismiss там нет → напоминание снова показывается.
    const newTab = await context.newPage();
    await newTab.goto("/");
    await expect(newTab.getByRole("button", { name: PROFILE_BUTTON_NAME })).toBeVisible();
    await expect(newTab.getByRole("region", { name: BANNER_NAME })).toBeVisible();

    await newTab.close();
  });
});
