import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, setAccessToken } from "../auth/tokenStore";
import { jsonResponse, type FetchSignature } from "../test/fetchStub";
import { ApiError } from "./errors";
import { createJourney, getCurrentUser } from "./sdk";

const REFRESH_PATH = "/v1/auth/refresh/";

const JOURNEY_BODY = {
  origin: { name: "Moscow", countryCode: "RU", latitude: 55.75, longitude: 37.62 },
  destination: { name: "London", countryCode: "GB", latitude: 51.5, longitude: -0.12 },
  transportType: "air",
  traveledYear: 2020,
  traveledMonth: null,
  traveledDay: null,
} as const;

let fetchMock: ReturnType<typeof vi.fn<FetchSignature>>;

/** Запрос, который стаб `fetch` получил n-м по счёту (SDK всегда шлёт `Request`). */
function requestAt(index: number): Request {
  return fetchMock.mock.calls[index][0] as Request;
}

beforeEach(() => {
  clearAccessToken();
  fetchMock = vi.fn<FetchSignature>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/*
 * Сшивка сгенерированного SDK с нашим транспортом: сам SDK покрывать нечем (он генерируется),
 * а вот `sdk.ts` — наш код, и именно он решает, дойдёт ли запрос до `appFetch` вообще.
 * Проверяем стык целиком, от вызова операции до повторной отправки после refresh.
 */
describe("sdk", () => {
  it("шлёт запрос через транспорт приложения: Bearer, credentials, абсолютный URL", async () => {
    setAccessToken("my-token");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { username: "traveler", email: "t@example.com", displayName: null }),
    );

    await getCurrentUser({ throwOnError: true });

    const request = requestAt(0);
    // baseUrl обязателен: без него клиент собрал бы относительный URL, а `Request` вне
    // браузера его не резолвит.
    expect(new URL(request.url).pathname).toBe("/v1/users/me");
    expect(request.headers.get("Authorization")).toBe("Bearer my-token");
    expect(request.credentials).toBe("include");
  });

  it("POST после протухшего токена повторяется с телом, а не пустым", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_access_token", message: "x" }))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "new-token" }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));

    await createJourney({ body: JOURNEY_BODY, throwOnError: true });

    expect(fetchMock.mock.calls.filter(([url]) => url === REFRESH_PATH)).toHaveLength(1);
    const retried = requestAt(2);
    expect(retried.method).toBe("POST");
    expect(await retried.json()).toEqual(JOURNEY_BODY);
  });

  it("неуспех доезжает до вызывающего как ApiError с машинным кодом", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: "journeys.date_in_future", message: "ru" }));

    await expect(createJourney({ body: JOURNEY_BODY, throwOnError: true })).rejects.toMatchObject({
      status: 400,
      code: "journeys.date_in_future",
    });
  });

  it("ответ не по контракту — invalid_response, а не голый ZodError", async () => {
    // Успешный статус, но тело не проходит сгенерированную zod-схему: без интерсептора
    // ошибок наружу ушёл бы ZodError мимо applyApiError и всей i18n ошибок.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { username: 42 }));

    await expect(getCurrentUser({ throwOnError: true })).rejects.toMatchObject({
      status: 200,
      code: "invalid_response",
    });
  });

  it("сетевой сбой остаётся сетевым, а не подменяется invalid_response", async () => {
    // Ответа нет вовсе — интерсептор обязан пропустить ошибку как есть, иначе обрыв связи
    // отрендерился бы пользователю как «сервер прислал ерунду».
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const error = await getCurrentUser({ throwOnError: true }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});
