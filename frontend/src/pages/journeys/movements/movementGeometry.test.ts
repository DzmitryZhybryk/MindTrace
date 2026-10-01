import { describe, expect, it } from "vitest";

import { projectToScreen } from "../../../components/worldProjection";
import { fadeAlong, piecePath, projectArc } from "./movementGeometry";

const MOSCOW = { latitude: 55.75, longitude: 37.62 };
const LONDON = { latitude: 51.5, longitude: -0.12 };
// Токио → Лос-Анджелес: короткий путь по большому кругу идёт через Тихий океан, через антимеридиан.
const TOKYO = { latitude: 35.69, longitude: 139.69 };
const LOS_ANGELES = { latitude: 34.05, longitude: -118.24 };

describe("projectArc", () => {
  it("дуга без антимеридиана — один кусок от точки отправления до точки назначения", () => {
    const pieces = projectArc(MOSCOW, LONDON);

    expect(pieces).toHaveLength(1);
    const [start, end] = [pieces[0][0], pieces[0][pieces[0].length - 1]];
    const [moscowX, moscowY] = projectToScreen(MOSCOW.longitude, MOSCOW.latitude);
    const [londonX, londonY] = projectToScreen(LONDON.longitude, LONDON.latitude);
    expect(start[0]).toBeCloseTo(moscowX);
    expect(start[1]).toBeCloseTo(moscowY);
    expect(end[0]).toBeCloseTo(londonX);
    expect(end[1]).toBeCloseTo(londonY);
  });

  it("дуга большого круга выгибается к полюсу, а не идёт по прямой на холсте", () => {
    const pieces = projectArc(MOSCOW, LONDON);
    const middle = pieces[0][Math.floor(pieces[0].length / 2)];
    const straightMiddleY = (projectToScreen(MOSCOW.longitude, MOSCOW.latitude)[1] + projectToScreen(LONDON.longitude, LONDON.latitude)[1]) / 2;

    // Север — вверху холста: середина дуги выше середины отрезка.
    expect(middle[1]).toBeLessThan(straightMiddleY);
  });

  it("дуга через антимеридиан разрезана на два куска у противоположных краёв карты", () => {
    const pieces = projectArc(TOKYO, LOS_ANGELES);

    expect(pieces).toHaveLength(2);
    const firstEnd = pieces[0][pieces[0].length - 1];
    const secondStart = pieces[1][0];
    expect(firstEnd[0]).toBeGreaterThan(900);
    expect(secondStart[0]).toBeLessThan(100);
  });
});

describe("piecePath", () => {
  it("кусок начинается командой M, остальные точки — L, координаты с одним знаком после точки", () => {
    expect(
      piecePath([
        [1, 2],
        [3, 4],
        [7.25, 8],
      ]),
    ).toBe("M1.0 2.0L3.0 4.0L7.3 8.0");
  });
});

describe("fadeAlong", () => {
  // Прямой кусок вдоль оси x: точки через каждые 10 единиц, от 0 до 100.
  const piece = Array.from({ length: 11 }, (_, index) => [index * 10, 50] as const);

  it("у конца куска гаснет на заданной длине: от точки за этой длиной до самого края", () => {
    expect(fadeAlong(piece, "end", 30)).toEqual([
      [70, 50],
      [100, 50],
    ]);
  });

  it("у начала куска — то же с другой стороны", () => {
    expect(fadeAlong(piece, "start", 30)).toEqual([
      [30, 50],
      [0, 50],
    ]);
  });

  it("кусок короче длины затухания гаснет целиком — от дальнего конца", () => {
    expect(fadeAlong(piece, "end", 500)).toEqual([
      [0, 50],
      [100, 50],
    ]);
  });
});
