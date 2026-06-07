import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dismissVerifyBanner, isVerifyBannerDismissed, resetVerifyBannerDismissed } from "./verifyBannerStorage";

const DISMISS_STORAGE_KEY = "verify-banner-dismissed";

describe("verifyBannerStorage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("по умолчанию плашка не скрыта", () => {
    expect(isVerifyBannerDismissed()).toBe(false);
  });

  it("dismiss помечает плашку скрытой в sessionStorage", () => {
    dismissVerifyBanner();

    expect(isVerifyBannerDismissed()).toBe(true);
    expect(sessionStorage.getItem(DISMISS_STORAGE_KEY)).toBe("1");
  });

  it("reset снимает флаг скрытия", () => {
    dismissVerifyBanner();
    resetVerifyBannerDismissed();

    expect(isVerifyBannerDismissed()).toBe(false);
  });

  it("возвращает false, когда чтение из sessionStorage бросает", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(isVerifyBannerDismissed()).toBe(false);
  });

  it("не бросает, когда запись в sessionStorage недоступна", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(() => dismissVerifyBanner()).not.toThrow();
  });
});
