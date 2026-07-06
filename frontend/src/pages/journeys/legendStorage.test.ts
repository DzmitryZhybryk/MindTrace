import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isLegendCollapsed, setLegendCollapsed } from "./legendStorage";

const KEY = "journeys-legend-collapsed";

describe("legendStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("по умолчанию (ничего не сохранено) легенда не свёрнута", () => {
    expect(isLegendCollapsed()).toBe(false);
  });

  it("читает свёрнутое состояние из сохранённого флага", () => {
    localStorage.setItem(KEY, "1");
    expect(isLegendCollapsed()).toBe(true);
  });

  it("любое значение кроме \"1\" считается развёрнутым", () => {
    localStorage.setItem(KEY, "0");
    expect(isLegendCollapsed()).toBe(false);
  });

  it("setLegendCollapsed(true) записывает флаг в localStorage", () => {
    setLegendCollapsed(true);
    expect(localStorage.getItem(KEY)).toBe("1");
    expect(isLegendCollapsed()).toBe(true);
  });

  it("setLegendCollapsed(false) очищает флаг", () => {
    localStorage.setItem(KEY, "1");
    setLegendCollapsed(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(isLegendCollapsed()).toBe(false);
  });

  it("недоступный localStorage при чтении → false (без исключения)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage disabled");
    });
    expect(isLegendCollapsed()).toBe(false);
  });

  it("недоступный localStorage при записи → тихо проглатываем", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("localStorage disabled");
    });
    expect(() => setLegendCollapsed(true)).not.toThrow();
  });
});
