import { afterEach, describe, expect, it, vi } from "vitest";

import { emit, on } from "./events";

describe("auth events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("вызывает подписчика при emit того же события", () => {
    const listener = vi.fn();
    const off = on("verify-required", listener);

    emit("verify-required", undefined);

    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("не вызывает подписчика после отписки", () => {
    const listener = vi.fn();
    const off = on("auth-required", listener);

    off();
    emit("auth-required", undefined);

    expect(listener).not.toHaveBeenCalled();
  });

  it("не доставляет событие подписчикам другого события", () => {
    const verifyListener = vi.fn();
    const authListener = vi.fn();
    const offVerify = on("verify-required", verifyListener);
    const offAuth = on("auth-required", authListener);

    emit("verify-required", undefined);

    expect(verifyListener).toHaveBeenCalledTimes(1);
    expect(authListener).not.toHaveBeenCalled();
    offVerify();
    offAuth();
  });

  it("доставляет событие всем подписчикам", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = on("verify-required", first);
    const offSecond = on("verify-required", second);

    emit("verify-required", undefined);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    offFirst();
    offSecond();
  });
});
