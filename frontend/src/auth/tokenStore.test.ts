import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAccessToken, getAccessToken, setAccessToken, subscribeAccessToken } from "./tokenStore";

const STORAGE_KEY = "access_token";

describe("tokenStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccessToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setAccessToken сохраняет токен в память и sessionStorage", () => {
    setAccessToken("tok");

    expect(getAccessToken()).toBe("tok");
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe("tok");
  });

  it("clearAccessToken очищает память и sessionStorage", () => {
    setAccessToken("tok");

    clearAccessToken();

    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("setAccessToken уведомляет подписчиков новым токеном", () => {
    const listener = vi.fn();
    const off = subscribeAccessToken(listener);

    setAccessToken("tok");

    expect(listener).toHaveBeenCalledWith("tok");
    off();
  });

  it("clearAccessToken уведомляет подписчиков значением null", () => {
    const listener = vi.fn();
    const off = subscribeAccessToken(listener);

    clearAccessToken();

    expect(listener).toHaveBeenCalledWith(null);
    off();
  });

  it("отписанный слушатель не получает обновлений", () => {
    const listener = vi.fn();
    const off = subscribeAccessToken(listener);

    off();
    setAccessToken("tok");

    expect(listener).not.toHaveBeenCalled();
  });

  it("держит токен в памяти, даже если запись в sessionStorage упала", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(() => setAccessToken("tok")).not.toThrow();
    expect(getAccessToken()).toBe("tok");
  });

  it("при инициализации читает токен из sessionStorage", async () => {
    sessionStorage.setItem(STORAGE_KEY, "persisted");
    vi.resetModules();

    const freshModule = await import("./tokenStore");

    expect(freshModule.getAccessToken()).toBe("persisted");
  });

  it("при инициализации возвращает null, если sessionStorage бросает", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.resetModules();

    const freshModule = await import("./tokenStore");

    expect(freshModule.getAccessToken()).toBeNull();
  });
});
