import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { i18n } from "../i18n";
import { GEO_PLACES, server } from "../test/handlers";
import { act, createTestQueryClient, waitFor } from "../test/render";
import { placeLabel, usePlaceNames } from "./placeNames";

const [MOSCOW, LONDON, PARIS] = GEO_PLACES;
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

type ResolveBody = { placeIds: string[]; language: string };

/** Replaces `resolve` with the same fake but records request bodies. */
function recordResolveRequests(): ResolveBody[] {
  const bodies: ResolveBody[] = [];
  server.use(
    http.post("/v1/geo/places/resolve", async ({ request }) => {
      const body = (await request.json()) as ResolveBody;
      bodies.push(body);
      const items = GEO_PLACES.filter((place) => body.placeIds.includes(place.placeId)).map((place) => ({
        placeId: place.placeId,
        name: place.name,
      }));
      return HttpResponse.json({ items });
    }),
  );
  return bodies;
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function renderPlaceNames(placeIds: string[], queryClient: QueryClient = createTestQueryClient()) {
  return renderHook(({ ids }: { ids: string[] }) => usePlaceNames(ids), {
    initialProps: { ids: placeIds },
    wrapper: wrapperFor(queryClient),
  });
}

afterEach(async () => {
  // The language is a global i18n singleton: restore en so tests do not affect each other.
  await i18n.changeLanguage("en");
});

describe("usePlaceNames", () => {
  it("отдаёт название известного места и null для места, которого geo не знает", async () => {
    const { result } = renderPlaceNames([MOSCOW.placeId, UNKNOWN_ID]);

    await waitFor(() => expect(result.current(MOSCOW.placeId)).toBe("Moscow"));
    expect(result.current(UNKNOWN_ID)).toBeNull();
  });

  it("пока названия грузятся, отдаёт undefined, а не «неизвестно»", () => {
    const { result } = renderPlaceNames([MOSCOW.placeId]);

    expect(result.current(MOSCOW.placeId)).toBeUndefined();
  });

  it("без id в geo не ходит", () => {
    const bodies = recordResolveRequests();
    const queryClient = createTestQueryClient();
    const { result } = renderPlaceNames([], queryClient);

    // The query is disabled at once: the client loads nothing and nothing went to geo.
    expect(queryClient.isFetching()).toBe(0);
    expect(bodies).toHaveLength(0);
    expect(result.current(MOSCOW.placeId)).toBeUndefined();
  });

  it("одни и те же места в другом порядке и с повторами — один запрос на всех", async () => {
    const bodies = recordResolveRequests();
    const queryClient = createTestQueryClient();
    const first = renderPlaceNames([MOSCOW.placeId, LONDON.placeId], queryClient);
    const second = renderPlaceNames([LONDON.placeId, MOSCOW.placeId, LONDON.placeId], queryClient);

    await waitFor(() => expect(first.result.current(LONDON.placeId)).toBe("London"));
    expect(second.result.current(MOSCOW.placeId)).toBe("Moscow");
    expect(bodies).toHaveLength(1);
  });

  it("больше 1000 id режет на запросы по 1000", async () => {
    const bodies = recordResolveRequests();
    const manyIds = Array.from(
      { length: 1500 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const { result } = renderPlaceNames([...manyIds, MOSCOW.placeId]);

    await waitFor(() => expect(result.current(MOSCOW.placeId)).toBe("Moscow"));
    expect(bodies.map((body) => body.placeIds.length).sort((left, right) => right - left)).toEqual([1000, 501]);
  });

  it("новое место, пока догружается, — undefined, а прошлые названия остаются", async () => {
    const queryClient = createTestQueryClient();
    const { result, rerender } = renderPlaceNames([MOSCOW.placeId], queryClient);
    await waitFor(() => expect(result.current(MOSCOW.placeId)).toBe("Moscow"));

    // Hold the response for the second set to catch the intermediate state.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("/v1/geo/places/resolve", async () => {
        await gate;
        return HttpResponse.json({ items: [{ placeId: MOSCOW.placeId, name: "Moscow" }] });
      }),
    );
    rerender({ ids: [MOSCOW.placeId, PARIS.placeId] });

    expect(result.current(MOSCOW.placeId)).toBe("Moscow");
    expect(result.current(PARIS.placeId)).toBeUndefined();

    release();
    // The response came without Paris: now it really is "unknown".
    await waitFor(() => expect(result.current(PARIS.placeId)).toBeNull());
  });

  it("при смене языка интерфейса просит названия на новом языке", async () => {
    const bodies = recordResolveRequests();
    const { result } = renderPlaceNames([MOSCOW.placeId]);
    await waitFor(() => expect(result.current(MOSCOW.placeId)).toBe("Moscow"));

    await act(async () => {
      await i18n.changeLanguage("ru");
    });

    await waitFor(() => expect(bodies.map((body) => body.language)).toEqual(["en", "ru"]));
  });
});

describe("placeLabel", () => {
  it("название показывает как есть, неизвестное место — подписью «неизвестно», загрузку — никак", () => {
    expect(placeLabel("Moscow", "Unknown place")).toBe("Moscow");
    expect(placeLabel(null, "Unknown place")).toBe("Unknown place");
    expect(placeLabel(undefined, "Unknown place")).toBeUndefined();
  });
});
