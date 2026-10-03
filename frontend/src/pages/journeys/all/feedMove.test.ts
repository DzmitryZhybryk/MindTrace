import { describe, expect, it } from "vitest";

import type { JourneysFeedResponse } from "../../../api/sdk";
import { makeFeedJourney as journey } from "../../../test/feedJourney";
import { moveJourneyInPages, resolveMoveTarget } from "./feedMove";

const FEED = [journey("a", 2021), journey("b", 2021), journey("c", 2019), journey("d", 2019)];

describe("resolveMoveTarget", () => {
  it("строку тянули вниз — встаёт после той, на которую бросили, и берёт её год", () => {
    expect(resolveMoveTarget(FEED, "a", "c")).toEqual({ neighborJourneyId: "c", placement: "after", traveledYear: 2019 });
  });

  it("строку тянули вверх — встаёт перед той, на которую бросили", () => {
    expect(resolveMoveTarget(FEED, "d", "b")).toEqual({ neighborJourneyId: "b", placement: "before", traveledYear: 2021 });
  });

  it("бросили на своё место или на неизвестную строку — переноса нет", () => {
    expect(resolveMoveTarget(FEED, "b", "b")).toBeNull();
    expect(resolveMoveTarget(FEED, "b", "zzz")).toBeNull();
    expect(resolveMoveTarget(FEED, "zzz", "b")).toBeNull();
  });
});

describe("moveJourneyInPages", () => {
  const pages: JourneysFeedResponse[] = [
    { items: [journey("a", 2021), journey("b", 2021)], nextCursor: "c1" },
    { items: [journey("c", 2019), journey("d", 2019)], nextCursor: null },
  ];

  it("после соседа из другой порции: строка уходит из своей порции и встаёт за соседом с его годом", () => {
    const moved = moveJourneyInPages(pages, "a", { neighborJourneyId: "c", placement: "after", traveledYear: 2019 });

    expect(moved.map((page) => page.items.map((item) => [item.journeyId, item.traveledYear]))).toEqual([
      [["b", 2021]],
      [
        ["c", 2019],
        ["a", 2019],
        ["d", 2019],
      ],
    ]);
    expect(moved.map((page) => page.nextCursor)).toEqual(["c1", null]);
  });

  it("перед соседом: строка встаёт непосредственно перед ним", () => {
    const moved = moveJourneyInPages(pages, "d", { neighborJourneyId: "a", placement: "before", traveledYear: 2021 });

    expect(moved[0].items.map((item) => item.journeyId)).toEqual(["d", "a", "b"]);
    expect(moved[1].items.map((item) => item.journeyId)).toEqual(["c"]);
  });

  it("соседа или строки нет в загруженных порциях — порции не меняются", () => {
    const withoutNeighbor = moveJourneyInPages(pages, "a", { neighborJourneyId: "zzz", placement: "after", traveledYear: 2019 });
    const withoutJourney = moveJourneyInPages(pages, "zzz", { neighborJourneyId: "c", placement: "after", traveledYear: 2019 });

    expect(withoutNeighbor).toEqual(pages);
    expect(withoutJourney).toEqual(pages);
  });
});
