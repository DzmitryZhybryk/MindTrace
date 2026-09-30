import { describe, expect, it } from "vitest";

import { getMovementsMapQueryKey } from "../../../api/sdk";
import { movementsQueryOptions } from "./movementsQuery";

describe("movementsQueryOptions", () => {
  it("без фильтров — запрос без параметров", () => {
    expect(movementsQueryOptions().queryKey).toEqual(getMovementsMapQueryKey({ query: {} }));
  });

  it("передаёт окно лет", () => {
    expect(movementsQueryOptions({ yearFrom: 2019, yearTo: 2021 }).queryKey).toEqual(
      getMovementsMapQueryKey({ query: { yearFrom: 2019, yearTo: 2021 } }),
    );
  });

  it("одинаковый набор транспорта в любом порядке даёт один ключ", () => {
    expect(movementsQueryOptions({ transportTypes: ["water", "air"] }).queryKey).toEqual(
      movementsQueryOptions({ transportTypes: ["air", "water"] }).queryKey,
    );
    expect(movementsQueryOptions({ transportTypes: ["water", "air"] }).queryKey).toEqual(
      getMovementsMapQueryKey({ query: { transportType: ["air", "water"] } }),
    );
  });

  it("выбраны все виды транспорта — то же, что без фильтра", () => {
    expect(movementsQueryOptions({ transportTypes: ["land", "air", "water"] }).queryKey).toEqual(
      movementsQueryOptions().queryKey,
    );
  });

  it("ответ не устаревает сам — его сбрасывает добавление поездки", () => {
    expect(movementsQueryOptions().staleTime).toBe(Infinity);
  });
});
