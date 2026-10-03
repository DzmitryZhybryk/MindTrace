import { describe, expect, it } from "vitest";

import { isYearInRange, toggleYear } from "./yearRange";

describe("toggleYear", () => {
  it("без выбора выбирает один нажатый год", () => {
    expect(toggleYear(null, 2020)).toEqual([2020, 2020]);
  });

  it("при одном выбранном годе другой год растягивает выбор в диапазон — в любом порядке нажатий", () => {
    expect(toggleYear([2020, 2020], 2023)).toEqual([2020, 2023]);
    expect(toggleYear([2020, 2020], 2017)).toEqual([2017, 2020]);
  });

  it("повторное нажатие на единственный выбранный год снимает выбор", () => {
    expect(toggleYear([2020, 2020], 2020)).toBeNull();
  });

  it("при выбранном диапазоне нажатие начинает выбор заново с этого года — и внутри диапазона, и на его границе", () => {
    expect(toggleYear([2017, 2020], 2019)).toEqual([2019, 2019]);
    expect(toggleYear([2017, 2020], 2017)).toEqual([2017, 2017]);
  });
});

describe("isYearInRange", () => {
  it("без диапазона подходит любой год", () => {
    expect(isYearInRange(null, 1990)).toBe(true);
  });

  it("границы диапазона включительно, годы снаружи — нет", () => {
    expect(isYearInRange([2017, 2020], 2017)).toBe(true);
    expect(isYearInRange([2017, 2020], 2020)).toBe(true);
    expect(isYearInRange([2017, 2020], 2016)).toBe(false);
    expect(isYearInRange([2017, 2020], 2021)).toBe(false);
  });
});
