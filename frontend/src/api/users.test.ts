import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { clearAccessToken } from "../auth/tokenStore";
import { getCurrentUser } from "./users";

type FetchSignature = (input: string, init?: RequestInit) => Promise<Response>;

/** 200-ответ с JSON-телом для стаба `fetch` (unit минует MSW — см. client.test.ts). */
function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("getCurrentUser", () => {
  let fetchMock: ReturnType<typeof vi.fn<FetchSignature>>;

  beforeEach(() => {
    clearAccessToken();
    sessionStorage.clear();
    fetchMock = vi.fn<FetchSignature>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("возвращает профиль с заданным displayName", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({ username: "alice", email: "alice@example.com", displayName: "Alice D." }),
    );

    const user = await getCurrentUser();

    expect(user).toEqual({ username: "alice", email: "alice@example.com", displayName: "Alice D." });
  });

  it("пропускает displayName: null — фоллбэк на username делает рендер, не API-слой", async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ username: "alice", email: "alice@example.com", displayName: null }));

    const user = await getCurrentUser();

    expect(user.displayName).toBeNull();
  });

  it("бросает на невалидном ответе (displayName отсутствует) — fail fast на HTTP-границе", async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ username: "alice", email: "alice@example.com" }));

    await expect(getCurrentUser()).rejects.toThrow(ZodError);
  });
});
