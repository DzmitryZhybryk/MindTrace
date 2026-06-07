/**
 * Реюзабельные MSW-handlers — «API fakes» фронта (аналог backend `tests/fakes/`).
 *
 * Дефолтные happy-path ответы для всех `/v1/auth/*`-роутов. Конкретный тест
 * переопределяет нужный кейс через `server.use(...)` (ошибки, конфликты), не
 * трогая остальные. Сервер поднимается/глушится в `src/test/setup.ts`.
 *
 * Unit-тесты сюда не ходят: они ставят собственный `fetch`-мок через
 * `vi.stubGlobal` и MSW минуют (см. `api/client.test.ts`). MSW работает только
 * на component-слое, где `fetch` не подменяется.
 */

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** base64url-кодирование payload-сегмента JWT (`+/` → `-_`, без паддинга). */
function base64Url(value: string): string {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type TokenClaims = {
  sub?: string;
  email_verified?: boolean;
  exp?: number;
};

/**
 * Собирает декодируемый `header.<payload>.signature`-токен с заданными claims
 * (подпись не проверяется — фронт декодит payload без верификации, см. `jwt.ts`).
 * По умолчанию `email_verified: true`, чтобы успешный логин не открывал
 * verify-диалог в тестах, где это не проверяется.
 */
export function makeAccessToken(claims: TokenClaims = {}): string {
  const payload = {
    sub: claims.sub ?? "user-test",
    email_verified: claims.email_verified ?? true,
    exp: claims.exp ?? 4_102_444_800, // 2100-01-01, заведомо в будущем
  };

  return `header.${base64Url(JSON.stringify(payload))}.signature`;
}

/** Токен по умолчанию для успешных login/register-ответов. */
export const TEST_ACCESS_TOKEN = makeAccessToken();

const successTokenBody = { access_token: TEST_ACCESS_TOKEN, token_type: "bearer" };

export const handlers = [
  http.post("/v1/auth/register/", () => HttpResponse.json(successTokenBody, { status: 201 })),
  http.post("/v1/auth/login/", () => HttpResponse.json(successTokenBody, { status: 200 })),
  http.post("/v1/auth/logout/", () => new HttpResponse(null, { status: 204 })),
  // Дефолт: сессии нет — bootstrap-refresh в `AuthProvider` детерминированно
  // завершается «не залогинен». Тест залогиненного юзера переопределяет на 200.
  http.post("/v1/auth/refresh/", () =>
    HttpResponse.json(
      { code: "auth.invalid_refresh_token", message: "no session" },
      { status: 401 },
    ),
  ),
  // 202 «принято в async-обработку» с честно пустым телом — как отдаёт backend
  // (Response(status_code=202)); parseSuccess устойчив к пустому телу любого 2xx.
  http.post("/v1/auth/email/send-verification/", () => new HttpResponse(null, { status: 202 })),
  http.post("/v1/auth/email/verify/", () => new HttpResponse(null, { status: 204 })),
];

export const server = setupServer(...handlers);
