import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { on } from "../auth/events";
import { clearAccessToken, getAccessToken, setAccessToken } from "../auth/tokenStore";
import { apiFetch, ensureRefreshed } from "./client";
import { ApiError } from "./errors";

const REFRESH_PATH = "/v1/auth/refresh/";

type FetchSignature = (input: string, init?: RequestInit) => Promise<Response>;

/** Управляемый промис: позволяет держать запрос «в полёте» и резолвить его вручную. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/** JSON-ответ с заданным статусом. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Считает, сколько раз дёрнули именно `/v1/auth/refresh/`. */
function refreshCallCount(mock: ReturnType<typeof vi.fn<FetchSignature>>): number {
  return mock.mock.calls.filter(([url]) => url === REFRESH_PATH).length;
}

let fetchMock: ReturnType<typeof vi.fn<FetchSignature>>;

describe("apiFetch", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccessToken();
    fetchMock = vi.fn<FetchSignature>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("возвращает распарсенный JSON при успехе", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 1 }));

    expect(await apiFetch("/v1/x/")).toEqual({ id: 1 });
  });

  it("возвращает undefined для 204 No Content", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    expect(await apiFetch("/v1/x/", { method: "DELETE" })).toBeUndefined();
  });

  it("возвращает undefined для успешного ответа с пустым телом (не 204)", async () => {
    // 202 «принято в async-обработку» с пустым телом (send-verification): не должно
    // падать на response.json() — parseSuccess отдаёт undefined.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    expect(await apiFetch("/v1/x/", { method: "POST" })).toBeUndefined();
  });

  it("на успешный ответ с битым JSON-телом бросает invalid_response", async () => {
    // 2xx с непустым, но не-JSON телом (прокси отдал HTML под 200, обрезанный ответ):
    // parseSuccess не даёт JSON.parse выбросить голый SyntaxError — заворачивает в ApiError.
    fetchMock.mockResolvedValueOnce(
      new Response("{ broken json", { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(apiFetch("/v1/x/")).rejects.toMatchObject({ status: 200, code: "invalid_response" });
  });

  it("подставляет Authorization, credentials include и Content-Type для json", async () => {
    setAccessToken("my-token");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await apiFetch("/v1/x/", { json: { a: 1 } });

    const [url, options] = fetchMock.mock.calls[0];
    const headers = new Headers(options?.headers);
    expect(url).toBe("/v1/x/");
    expect(options?.credentials).toBe("include");
    expect(headers.get("Authorization")).toBe("Bearer my-token");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(options?.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("не добавляет Authorization без токена", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await apiFetch("/v1/x/");

    const [, options] = fetchMock.mock.calls[0];
    expect(new Headers(options?.headers).has("Authorization")).toBe(false);
  });

  it("на 401 invalid_credentials не делает refresh и бросает ApiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_credentials", message: "x" }));

    await expect(apiFetch("/v1/auth/login/", { method: "POST" })).rejects.toMatchObject({
      status: 401,
      code: "auth.invalid_credentials",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("на 401 email_not_verified эмитит verify-required, не делает refresh и бросает", async () => {
    const verifyListener = vi.fn();
    const off = on("verify-required", verifyListener);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: "auth.email_not_verified", message: "x" }));

    await expect(apiFetch("/v1/x/")).rejects.toMatchObject({ code: "auth.email_not_verified" });

    expect(verifyListener).toHaveBeenCalledTimes(1);
    expect(refreshCallCount(fetchMock)).toBe(0);
    off();
  });

  it("на прочий 401 делает один refresh, повторяет запрос и возвращает результат", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_access_token", message: "x" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await apiFetch("/v1/protected/", { method: "POST" });

    expect(result).toEqual({ ok: true });
    expect(getAccessToken()).toBe("new-token");
    expect(refreshCallCount(fetchMock)).toBe(1);
  });

  it("если повтор после refresh упал — бросает ошибку повтора", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_access_token", message: "x" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "new-token" }))
      .mockResolvedValueOnce(jsonResponse(500, { code: "internal_error", message: "x" }));

    await expect(apiFetch("/v1/protected/")).rejects.toMatchObject({ status: 500, code: "internal_error" });
  });

  it("если refresh не удался — эмитит auth-required и бросает исходную ошибку", async () => {
    const authListener = vi.fn();
    const off = on("auth-required", authListener);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_access_token", message: "x" }))
      .mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_refresh_token", message: "x" }));

    await expect(apiFetch("/v1/x/")).rejects.toBeInstanceOf(ApiError);

    expect(authListener).toHaveBeenCalledTimes(1);
    off();
  });

  it("на ошибку без валидного JSON-тела отдаёт unknown_error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    );

    await expect(apiFetch("/v1/x/")).rejects.toMatchObject({ status: 502, code: "unknown_error" });
  });

  it("на 401 самого /refresh/ не уходит в цикл refresh", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_refresh_token", message: "x" }));

    await expect(apiFetch(REFRESH_PATH, { method: "POST" })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ensureRefreshed", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccessToken();
    fetchMock = vi.fn<FetchSignature>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("два параллельных вызова делают один запрос /refresh/ (single-flight)", async () => {
    const inFlight = deferred<Response>();
    fetchMock.mockReturnValueOnce(inFlight.promise);

    const first = ensureRefreshed();
    const second = ensureRefreshed();
    inFlight.resolve(jsonResponse(200, { access_token: "shared" }));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(refreshCallCount(fetchMock)).toBe(1);
    expect(getAccessToken()).toBe("shared");
  });

  it("возвращает true и пишет токен при успешном refresh", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "fresh" }));

    expect(await ensureRefreshed()).toBe(true);
    expect(getAccessToken()).toBe("fresh");
  });

  it("возвращает false при неуспешном /refresh/", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: "auth.invalid_refresh_token", message: "x" }));

    expect(await ensureRefreshed()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("возвращает false, если запрос упал с исключением", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    expect(await ensureRefreshed()).toBe(false);
  });
});
