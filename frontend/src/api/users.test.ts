import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { jsonOk, type FetchSignature } from "../test/fetchStub";
import { getCurrentUser } from "./users";

describe("getCurrentUser", () => {
  let fetchMock: ReturnType<typeof vi.fn<FetchSignature>>;

  beforeEach(() => {
    fetchMock = vi.fn<FetchSignature>();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("шлёт GET на /v1/users/me и пробрасывает AbortSignal", async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ username: "alice", email: "alice@example.com", displayName: null }));
    const controller = new AbortController();

    await getCurrentUser(controller.signal);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/v1/users/me");
    expect(options?.signal).toBe(controller.signal);
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
