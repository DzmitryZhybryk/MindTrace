import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { FEED_JOURNEYS, server } from "../../../test/handlers";
import { intersectAllObserved } from "../../../test/intersection";
import { act, renderWithProviders, screen, waitFor, within } from "../../../test/render";
import { AllJourneysView } from "./AllJourneysView";

/** Подменяет ленту и запоминает query каждого запроса — тест смотрит, какие фильтры ушли. */
function recordFeedRequests(respond: (params: URLSearchParams) => Response = () => HttpResponse.json({ items: FEED_JOURNEYS, nextCursor: null })) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/v1/journeys/", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      return respond(params);
    }),
  );
  return requests;
}

describe("AllJourneysView", () => {
  it("показывает поездки по годам — свежий год сверху — с названиями мест и расстоянием", async () => {
    renderWithProviders(<AllJourneysView />);

    const year2021 = await screen.findByRole("region", { name: "2021" });
    const year2019 = screen.getByRole("region", { name: "2019" });
    expect(year2021.compareDocumentPosition(year2019) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await within(year2021).findByRole("button", { name: "Moscow" })).toBeInTheDocument();
    expect(within(year2021).getAllByRole("listitem")).toHaveLength(2);
    expect(within(year2021).getByText("2,500 km")).toBeInTheDocument();
    expect(within(year2019).getAllByRole("listitem")).toHaveLength(1);
  });

  it("без поездок предлагает добавить первую", async () => {
    server.use(
      http.get("/v1/journeys/", () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get("/v1/journeys/years", () => HttpResponse.json({ years: [] })),
    );
    renderWithProviders(<AllJourneysView />);

    expect(await screen.findByText("No journeys yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your first journey" })).toHaveAttribute("href", "/journeys/add");
  });

  it("чип года выбирает год, второй чип — диапазон, «All» снимает выбор", async () => {
    const requests = recordFeedRequests();
    const { user } = renderWithProviders(<AllJourneysView />);

    await user.click(await screen.findByRole("button", { name: "2019" }));
    await waitFor(() => expect(requests.at(-1)?.toString()).toBe("yearFrom=2019&yearTo=2019"));
    expect(screen.getByRole("button", { name: "2019" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "2021" }));
    await waitFor(() => expect(requests.at(-1)?.toString()).toBe("yearFrom=2019&yearTo=2021"));

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    // Без фильтров — тот же ключ, что у первого запроса: лента берётся из кэша, без нового запроса.
    expect(requests.at(-1)?.toString()).toBe("yearFrom=2019&yearTo=2021");
    expect(requests[0].toString()).toBe("");
  });

  it("снятый вид транспорта уходит фильтром из оставшихся; без транспорта лента не запрашивается", async () => {
    const requests = recordFeedRequests();
    const { user } = renderWithProviders(<AllJourneysView />);
    await screen.findByRole("region", { name: "2021" });

    await user.click(screen.getByRole("checkbox", { name: "Air" }));
    await waitFor(() => expect(requests.at(-1)?.getAll("transportType")).toEqual(["land", "water"]));

    await user.click(screen.getByRole("checkbox", { name: "Land" }));
    await user.click(screen.getByRole("checkbox", { name: "Water" }));
    const requestCount = requests.length;

    expect(await screen.findByText("Choose at least one transport")).toBeInTheDocument();
    expect(requests).toHaveLength(requestCount);
  });

  it("фильтр без совпадений — отдельное сообщение, а не «поездок пока нет»", async () => {
    recordFeedRequests((params) =>
      HttpResponse.json({ items: params.has("yearFrom") ? [] : FEED_JOURNEYS, nextCursor: null }),
    );
    const { user } = renderWithProviders(<AllJourneysView />);

    await user.click(await screen.findByRole("button", { name: "2019" }));

    expect(await screen.findByText("No journeys match these filters")).toBeInTheDocument();
    expect(screen.queryByText("No journeys yet")).not.toBeInTheDocument();
  });

  it("сторож в конце ленты догружает следующую порцию по курсору; строка из двух порций — одна", async () => {
    const londonToMoscow = {
      ...FEED_JOURNEYS[0],
      journeyId: "aaaaaaaa-0000-4000-8000-000000000004",
      origin: FEED_JOURNEYS[0].destination,
      destination: FEED_JOURNEYS[0].origin,
      traveledYear: 2018,
    };
    const requests = recordFeedRequests((params) =>
      params.get("cursor") === "page-2"
        ? HttpResponse.json({ items: [FEED_JOURNEYS[2], londonToMoscow], nextCursor: null })
        : HttpResponse.json({ items: FEED_JOURNEYS, nextCursor: "page-2" }),
    );
    renderWithProviders(<AllJourneysView />);
    await screen.findByRole("region", { name: "2019" });

    act(() => intersectAllObserved());

    const year2018 = await screen.findByRole("region", { name: "2018" });
    expect(within(year2018).getAllByRole("listitem")).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "2019" })).getAllByRole("listitem")).toHaveLength(1);
    expect(requests.map((params) => params.get("cursor"))).toEqual([null, "page-2"]);
  });

  it("порция не догрузилась — сообщение у конца ленты и повтор, который её догружает", async () => {
    let isFailing = true;
    recordFeedRequests((params) => {
      if (params.get("cursor") !== "page-2") {
        return HttpResponse.json({ items: FEED_JOURNEYS.slice(0, 2), nextCursor: "page-2" });
      }

      return isFailing
        ? HttpResponse.json({ code: "internal_error", message: "boom" }, { status: 500 })
        : HttpResponse.json({ items: FEED_JOURNEYS.slice(2), nextCursor: null });
    });
    const { user } = renderWithProviders(<AllJourneysView />);
    await screen.findByRole("region", { name: "2021" });

    act(() => intersectAllObserved());

    expect(await screen.findByText("Couldn't load more journeys")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "2021" })).toBeInTheDocument();
    isFailing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("region", { name: "2019" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load more journeys")).not.toBeInTheDocument();
  });

  it("ошибка загрузки ленты — сообщение и повтор, который её показывает", async () => {
    let isFailing = true;
    recordFeedRequests(() =>
      isFailing
        ? HttpResponse.json({ code: "internal_error", message: "boom" }, { status: 500 })
        : HttpResponse.json({ items: FEED_JOURNEYS, nextCursor: null }),
    );
    const { user } = renderWithProviders(<AllJourneysView />);

    expect(await screen.findByText("Couldn't load your journeys")).toBeInTheDocument();
    isFailing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("region", { name: "2021" })).toBeInTheDocument();
  });
});
