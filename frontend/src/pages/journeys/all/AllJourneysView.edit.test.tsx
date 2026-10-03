import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { pickPlace } from "../../../test/addJourney";
import { FEED_JOURNEYS, server } from "../../../test/handlers";
import { preferReducedMotion } from "../../../test/motion";
import { act, renderWithProviders, screen, waitFor, within } from "../../../test/render";
import { AllJourneysView } from "./AllJourneysView";

const [MOSCOW_TO_LONDON, , PARIS_TO_MOSCOW] = FEED_JOURNEYS;

/** Открывает ленту и правку строки Москва → Лондон кликом по её месту отправления. */
async function openMoscowToLondonEditor() {
  const rendered = renderWithProviders(<AllJourneysView />);
  const year2021 = await screen.findByRole("region", { name: "2021" });
  await rendered.user.click(await within(year2021).findByRole("button", { name: "Moscow" }));
  await screen.findByRole("button", { name: "Save" });
  return rendered;
}

describe("AllJourneysView — правка и удаление", () => {
  it("клик по месту открывает правку всей строки с полями поездки, фокус — в нажатом поле", async () => {
    await openMoscowToLondonEditor();

    expect(screen.getByLabelText("From")).toHaveValue("Moscow");
    expect(screen.getByLabelText("To")).toHaveValue("London");
    expect(screen.getByRole("radio", { name: "Air" })).toBeChecked();
    expect(screen.getByLabelText("From")).toHaveFocus();
  });

  it("Save отправляет все поля строки и закрывает правку", async () => {
    let request: { url: string; body: unknown } | null = null;
    server.use(
      http.put("/v1/journeys/:journeyId", async ({ request: incoming }) => {
        request = { url: new URL(incoming.url).pathname, body: await incoming.json() };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("radio", { name: "Water" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    expect(request).toEqual({
      url: `/v1/journeys/${MOSCOW_TO_LONDON.journeyId}`,
      body: {
        origin: {
          placeId: MOSCOW_TO_LONDON.origin.placeId,
          countryCode: "RU",
          latitude: MOSCOW_TO_LONDON.origin.latitude,
          longitude: MOSCOW_TO_LONDON.origin.longitude,
        },
        destination: {
          placeId: MOSCOW_TO_LONDON.destination.placeId,
          countryCode: "GB",
          latitude: MOSCOW_TO_LONDON.destination.latitude,
          longitude: MOSCOW_TO_LONDON.destination.longitude,
        },
        transportType: "water",
        traveledYear: 2021,
      },
    });
  });

  it("сохранённая строка мигает подсветкой, пока не кончится её анимация", async () => {
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("button", { name: "Save" }));

    const year2021 = screen.getByRole("region", { name: "2021" });
    const savedRow = await waitFor(() => {
      const row = year2021.querySelector(".journey-row--saved");
      if (!row) {
        throw new Error("строка ещё не подсвечена");
      }
      return row;
    });
    // В jsdom нет AnimationEvent, поэтому React слушает префиксное webkitAnimationEnd.
    const animationEnd = new Event("webkitAnimationEnd", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", { value: "journey-row-saved" });
    act(() => {
      savedRow.dispatchEvent(animationEnd);
    });

    expect(year2021.querySelector(".journey-row--saved")).toBeNull();
  });

  it("новое расстояние после сохранения докручивается до значения с сервера", async () => {
    let isSaved = false;
    server.use(
      http.put("/v1/journeys/:journeyId", () => {
        isSaved = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get("/v1/journeys/", () =>
        HttpResponse.json({
          items: isSaved ? [{ ...MOSCOW_TO_LONDON, distanceKm: 3000 }, ...FEED_JOURNEYS.slice(1)] : FEED_JOURNEYS,
          nextCursor: null,
        }),
      ),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("3,000 km")).toBeInTheDocument();
  });

  it("одинаковые города выбрать можно, а сохранить нельзя — ошибка у поля, запроса нет", async () => {
    const putSpy = vi.fn();
    server.use(
      http.put("/v1/journeys/:journeyId", () => {
        putSpy();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.clear(screen.getByLabelText("To"));
    await pickPlace({ user, label: "To", query: "Mos", option: /Moscow/iu });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Departure and destination must differ")).toBeInTheDocument();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it("Esc отменяет правку без запроса", async () => {
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("radio", { name: "Land" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "2021" })).getByTitle("Air")).toBeInTheDocument();
  });

  it("Esc в поле места сразу после открытия правки (подсказок нет) закрывает правку с первого раза", async () => {
    const { user } = await openMoscowToLondonEditor();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("Esc при показанных подсказках места закрывает только подсказки, правка остаётся", async () => {
    const { user } = await openMoscowToLondonEditor();
    const to = screen.getByLabelText("To");
    await user.clear(to);
    await user.type(to, "Par");
    await waitFor(() => {
      const listId = to.getAttribute("aria-controls");
      expect(listId && document.getElementById(listId)?.querySelector('[role="option"]')).toBeTruthy();
    });

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("поездку удалили в другом месте — Save показывает «этой поездки больше нет»", async () => {
    server.use(
      http.put("/v1/journeys/:journeyId", () =>
        HttpResponse.json({ code: "journeys.journey_not_found", message: "нет" }, { status: 404 }),
      ),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("This journey no longer exists")).toBeInTheDocument();
  });

  it("удаление спрашивает подтверждение в строке; «No» возвращает к правке", async () => {
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("«Yes» удаляет поездку: запрос DELETE, строка пропадает из ленты", async () => {
    preferReducedMotion();
    let deletedPath: string | null = null;
    server.use(
      http.delete("/v1/journeys/:journeyId", ({ request }) => {
        deletedPath = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => expect(within(screen.getByRole("region", { name: "2021" })).getAllByRole("listitem")).toHaveLength(1));
    expect(deletedPath).toBe(`/v1/journeys/${MOSCOW_TO_LONDON.journeyId}`);
  });

  it("удалена последняя поездка выбранного года — его нет на шкале, выбор снят и лента показывает все годы", async () => {
    preferReducedMotion();
    let isParisToMoscowDeleted = false;
    server.use(
      http.get("/v1/journeys/years", () => HttpResponse.json({ years: isParisToMoscowDeleted ? [2021] : [2019, 2021] })),
      http.get("/v1/journeys/", ({ request }) => {
        const yearFrom = new URL(request.url).searchParams.get("yearFrom");
        const journeys = FEED_JOURNEYS.filter(
          (journey) =>
            !(isParisToMoscowDeleted && journey.journeyId === PARIS_TO_MOSCOW.journeyId) &&
            (yearFrom === null || journey.traveledYear === Number(yearFrom)),
        );
        return HttpResponse.json({ items: journeys, nextCursor: null });
      }),
      http.delete("/v1/journeys/:journeyId", () => {
        isParisToMoscowDeleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderWithProviders(<AllJourneysView />);
    await screen.findByRole("region", { name: "2021" });
    screen.getByRole("slider", { name: "To year" }).focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    await waitFor(() => expect(screen.queryByRole("region", { name: "2021" })).not.toBeInTheDocument());

    await user.click(within(screen.getByRole("region", { name: "2019" })).getByRole("button", { name: "Paris" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes" }));

    expect(await screen.findByRole("region", { name: "2021" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "2021" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByText("No journeys match these filters")).not.toBeInTheDocument();
  });

  it("уже удалённая поездка (404 на DELETE) просто пропадает — цель достигнута", async () => {
    preferReducedMotion();
    server.use(
      http.delete("/v1/journeys/:journeyId", () =>
        HttpResponse.json({ code: "journeys.journey_not_found", message: "нет" }, { status: 404 }),
      ),
    );
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => expect(within(screen.getByRole("region", { name: "2021" })).getAllByRole("listitem")).toHaveLength(1));
    expect(screen.queryByText("This journey no longer exists")).not.toBeInTheDocument();
  });

  it("с анимацией удалённая строка сначала схлопывается и пропадает по окончании схлопывания", async () => {
    const { user } = await openMoscowToLondonEditor();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Yes" }));

    const year2021 = screen.getByRole("region", { name: "2021" });
    const collapsing = await waitFor(() => {
      const row = year2021.querySelector(".journey-row--collapsing");
      if (!row) {
        throw new Error("строка ещё не схлопывается");
      }
      return row;
    });
    expect(within(year2021).getAllByRole("listitem")).toHaveLength(2);

    // В jsdom нет AnimationEvent, поэтому React слушает префиксное webkitAnimationEnd, а fireEvent
    // теряет animationName — событие собираем сами.
    const animationEnd = new Event("webkitAnimationEnd", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", { value: "journey-row-collapse" });
    act(() => {
      collapsing.dispatchEvent(animationEnd);
    });

    await waitFor(() => expect(within(year2021).getAllByRole("listitem")).toHaveLength(1));
  });
});
