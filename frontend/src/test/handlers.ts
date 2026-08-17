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

import type { PlaceSuggestion } from "../api/journeys";
import type { CurrentUser } from "../api/users";

/**
 * Минимальный газеттир для component-тестов автокомплита (`/v1/geo/places/search`).
 * Имена уже «резолвнуты» (бэк отдаёт их под язык) — хендлер фильтрует по префиксу, как
 * боевой поиск. Тест переопределяет выдачу через `server.use(...)` для пустого/ошибочного кейса.
 */
export const GEO_PLACES: readonly PlaceSuggestion[] = [
  { placeId: "place-moscow", name: "Moscow", countryCode: "RU", latitude: 55.75, longitude: 37.62, population: 10_000_000 },
  { placeId: "place-london", name: "London", countryCode: "GB", latitude: 51.5, longitude: -0.12, population: 9_000_000 },
  { placeId: "place-paris", name: "Paris", countryCode: "FR", latitude: 48.85, longitude: 2.35, population: 2_000_000 },
];

/** base64url-кодирование payload-сегмента JWT (`+/` → `-_`, без паддинга). */
function base64Url(value: string): string {
  return btoa(value)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
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

/**
 * Профиль текущего пользователя (`/v1/users/me`). `displayName: null` — дефолт
 * покрывает фоллбэк на `username`; тест с заданным именем/ошибкой переопределяет
 * ответ через `server.use(...)`.
 */
export const TEST_CURRENT_USER: CurrentUser = {
  username: "traveler",
  email: "traveler@example.com",
  displayName: null,
};

const successTokenBody = { accessToken: TEST_ACCESS_TOKEN, tokenType: "bearer" };

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
  // Geo-автокомплит: префиксная фильтрация фикстуры по searchText (зеркало боевого поиска).
  http.get("/v1/geo/places/search/", ({ request }) => {
    const query = (new URL(request.url).searchParams.get("searchText") ?? "").trim().toLowerCase();
    const items = GEO_PLACES.filter((place) => place.name.toLowerCase().startsWith(query));
    return HttpResponse.json({ items });
  }),
  // Создание поездки: payload-on-create → 201 без тела (как отдаёт backend).
  http.post("/v1/journeys/", () => new HttpResponse(null, { status: 201 })),
  // Карта путешествий: агрегат посещённых стран (кормит WorldMap). Тест переопределяет
  // на пустой/ошибочный ответ через server.use(...).
  http.get("/v1/journeys/map", () =>
    HttpResponse.json({
      countries: [
        { countryCode: "RU", cities: [{ name: "Moscow", latitude: 55.75, longitude: 37.62, years: [2020, 2022] }] },
        { countryCode: "GB", cities: [{ name: "London", latitude: 51.5, longitude: -0.12, years: [2021] }] },
      ],
    }),
  ),
  // Профиль текущего пользователя: кормит CurrentUserProvider при любом залогиненном рендере.
  http.get("/v1/users/me", () => HttpResponse.json(TEST_CURRENT_USER)),
];

export const server = setupServer(...handlers);
