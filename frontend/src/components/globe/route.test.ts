import { describe, expect, it } from "vitest";

import type { PlaceSuggestion } from "../../api/journeys";
import {
  altitudeForSeparation,
  apexScale,
  arcAltitude,
  buildTrail,
  CAMERA_MAX_ALTITUDE,
  CAMERA_MIN_ALTITUDE,
  clamp,
  greatCirclePoint,
  isRealPlace,
} from "./route";

// Минск как «реальное» место из автокомплита; координаты переопределяются под кейс.
function makePlace(overrides: Partial<PlaceSuggestion> = {}): PlaceSuggestion {
  return {
    placeId: "1",
    name: "Minsk",
    countryCode: "BY",
    latitude: 53.9,
    longitude: 27.56,
    population: 2_000_000,
    ...overrides,
  };
}

describe("greatCirclePoint", () => {
  it("при t=0 возвращает старт", () => {
    const point = greatCirclePoint(0, 0, 0, 90, 0);
    expect(point.lat).toBeCloseTo(0);
    expect(point.lng).toBeCloseTo(0);
  });

  it("при t=1 возвращает финиш", () => {
    const point = greatCirclePoint(0, 0, 0, 90, 1);
    expect(point.lat).toBeCloseTo(0);
    expect(point.lng).toBeCloseTo(90);
  });

  it("при t=0.5 попадает в середину дуги экватора", () => {
    // Большой круг (0,0)→(0,90) по экватору: середина — (0, 45).
    const point = greatCirclePoint(0, 0, 0, 90, 0.5);
    expect(point.lat).toBeCloseTo(0);
    expect(point.lng).toBeCloseTo(45);
  });

  it("возвращает старт для вырожденной дуги (совпадающие точки)", () => {
    const point = greatCirclePoint(55, 37, 55, 37, 0.5);
    expect(point.lat).toBeCloseTo(55);
    expect(point.lng).toBeCloseTo(37);
  });
});

describe("arcAltitude", () => {
  it("равна 0 на концах маршрута", () => {
    expect(arcAltitude(0, 0.14)).toBeCloseTo(0);
    expect(arcAltitude(1, 0.14)).toBeCloseTo(0);
  });

  it("достигает апекса в середине", () => {
    expect(arcAltitude(0.5, 0.14)).toBeCloseTo(0.14);
  });
});

describe("clamp", () => {
  it("возвращает значение внутри диапазона без изменений", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("подрезает снизу", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("подрезает сверху", () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe("altitudeForSeparation", () => {
  it("отдаёт дальний предел при нулевом расстоянии", () => {
    expect(altitudeForSeparation(0)).toBe(CAMERA_MAX_ALTITUDE);
  });

  it("держит результат в пределах [MIN, MAX]", () => {
    for (const separation of [0.01, 0.1, 0.5, 1, 2, 3]) {
      const altitude = altitudeForSeparation(separation);
      expect(altitude).toBeGreaterThanOrEqual(CAMERA_MIN_ALTITUDE);
      expect(altitude).toBeLessThanOrEqual(CAMERA_MAX_ALTITUDE);
    }
  });

  it("монотонна: дальше города → выше камера", () => {
    expect(altitudeForSeparation(0.05)).toBeLessThan(altitudeForSeparation(0.3));
  });
});

describe("apexScale", () => {
  it("равен 0 при нулевом расстоянии", () => {
    expect(apexScale(0)).toBe(0);
  });

  it("насыщается в 1 на длинных маршрутах", () => {
    expect(apexScale(Math.PI)).toBe(1);
  });

  it("растёт с расстоянием и не превышает 1", () => {
    expect(apexScale(0.1)).toBeLessThan(apexScale(0.5));
    expect(apexScale(0.5)).toBeLessThanOrEqual(1);
  });
});

describe("buildTrail", () => {
  it("начинается у старта на нулевой высоте", () => {
    const trail = buildTrail(0, 0, 0, 90, 0.14, 1);
    const first = trail[0];
    expect(first.lat).toBeCloseTo(0);
    expect(first.lng).toBeCloseTo(0);
    expect(first.alt).toBeCloseTo(0);
  });

  it("при полном прогрессе доводит голову до финиша", () => {
    const trail = buildTrail(0, 0, 0, 90, 0.14, 1);
    const last = trail[trail.length - 1];
    expect(last.lng).toBeCloseTo(90);
  });

  it("поднимает след над поверхностью в середине маршрута", () => {
    const trail = buildTrail(0, 0, 0, 90, 0.14, 1);
    const maxAltitude = Math.max(...trail.map((point) => point.alt));
    expect(maxAltitude).toBeGreaterThan(0);
    expect(maxAltitude).toBeLessThanOrEqual(0.14 + 1e-9);
  });

  it("обрезает след по прогрессу — голова на середине, не на финише", () => {
    // progress=0.5 по экватору (0,0)→(0,90): голова в (0, 45).
    const trail = buildTrail(0, 0, 0, 90, 0.14, 0.5);
    const last = trail[trail.length - 1];
    expect(last.lng).toBeCloseTo(45);
  });
});

describe("isRealPlace", () => {
  it("false для null", () => {
    expect(isRealPlace(null)).toBe(false);
  });

  it("false для места с нулевыми координатами", () => {
    expect(isRealPlace(makePlace({ latitude: 0, longitude: 0 }))).toBe(false);
  });

  it("true для места с реальными координатами", () => {
    expect(isRealPlace(makePlace({ latitude: 53.9, longitude: 27.56 }))).toBe(true);
  });

  it("true если хотя бы одна координата ненулевая", () => {
    expect(isRealPlace(makePlace({ latitude: 0, longitude: 27.56 }))).toBe(true);
  });
});
