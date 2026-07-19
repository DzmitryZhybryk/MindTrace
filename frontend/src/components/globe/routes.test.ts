import { describe, expect, it } from "vitest";

import { ROUTE_SETS, routesOf } from "./routes";

const CONTINENTS = ["africa", "asia", "europe", "northAmerica", "oceania", "southAmerica"] as const;

describe("наборы маршрутов глобуса", () => {
  it.each(ROUTE_SETS.map((set, index) => ({ set, index })))(
    "набор $index: по 2 города на каждый континент",
    ({ set }) => {
      const cities = set.chains.flat();
      expect(cities).toHaveLength(12);
      expect(new Set(cities.map((city) => city.name)).size).toBe(12);

      for (const continent of CONTINENTS) {
        expect(cities.filter((city) => city.continent === continent)).toHaveLength(2);
      }
    },
  );

  it.each(ROUTE_SETS.map((set, index) => ({ set, index })))(
    "набор $index: каждая цепь берёт ровно по одному городу с континента",
    ({ set }) => {
      for (const chain of set.chains) {
        expect(new Set(chain.map((city) => city.continent)).size).toBe(chain.length);
      }
    },
  );

  it.each(ROUTE_SETS.map((set, index) => ({ set, index })))(
    "набор $index: ни одна дуга не соединяет города одного континента",
    ({ set }) => {
      const sameContinent = routesOf(set).filter(
        (route) => route.from.continent === route.to.continent,
      );
      expect(sameContinent.map((route) => `${route.from.name}→${route.to.name}`)).toEqual([]);
    },
  );

  it.each(ROUTE_SETS.map((set, index) => ({ set, index })))(
    "набор $index: степень города в пределах 1..3",
    ({ set }) => {
      const degree = new Map<string, number>();
      for (const route of routesOf(set)) {
        degree.set(route.from.name, (degree.get(route.from.name) ?? 0) + 1);
        degree.set(route.to.name, (degree.get(route.to.name) ?? 0) + 1);
      }

      expect(degree.size).toBe(12);
      const outOfRange = [...degree.entries()].filter(([, count]) => count < 1 || count > 3);
      expect(outOfRange).toEqual([]);
    },
  );

  it.each(ROUTE_SETS.map((set, index) => ({ set, index })))(
    "набор $index: перемычки идут между цепями, а не внутри одной",
    ({ set }) => {
      const chainOf = (name: string) =>
        set.chains.findIndex((chain) => chain.some((city) => city.name === name));

      const withinOneChain = set.bridges.filter(
        (bridge) => chainOf(bridge.from.name) === chainOf(bridge.to.name),
      );
      expect(withinOneChain.map((b) => `${b.from.name}→${b.to.name}`)).toEqual([]);
    },
  );
});
