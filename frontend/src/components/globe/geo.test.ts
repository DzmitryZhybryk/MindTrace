import { describe, expect, it } from "vitest";

import { centralAngleRad, toDeg } from "./geo";

describe("centralAngleRad", () => {
  it("возвращает 0 для совпадающих точек", () => {
    expect(centralAngleRad(55, 37, 55, 37)).toBeCloseTo(0);
  });

  it("возвращает π для антиподов по экватору", () => {
    // (0,0) и (0,180) — противоположные точки экватора, центральный угол = π.
    expect(centralAngleRad(0, 0, 0, 180)).toBeCloseTo(Math.PI);
  });

  it("возвращает π/2 для четверти экватора", () => {
    expect(centralAngleRad(0, 0, 0, 90)).toBeCloseTo(Math.PI / 2);
  });

  it("симметричен по перестановке точек", () => {
    const ab = centralAngleRad(55, 37, 40, -74);
    const ba = centralAngleRad(40, -74, 55, 37);
    expect(ab).toBeCloseTo(ba);
  });
});

describe("toDeg", () => {
  it("переводит π в 180 градусов", () => {
    expect(toDeg(Math.PI)).toBeCloseTo(180);
  });

  it("переводит π/2 в 90 градусов", () => {
    expect(toDeg(Math.PI / 2)).toBeCloseTo(90);
  });

  it("переводит 0 в 0", () => {
    expect(toDeg(0)).toBe(0);
  });
});
