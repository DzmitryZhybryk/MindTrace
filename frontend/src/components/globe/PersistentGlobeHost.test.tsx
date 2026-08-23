import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { getJourneysMapQueryKey } from "../../api/sdk";
import { server } from "../../test/handlers";
import { act, createTestQueryClient, makeAuthValue, renderWithProviders, screen, waitFor } from "../../test/render";
import type { AuthContextValue } from "../../auth/useAuth";
import { PersistentGlobeHost } from "./PersistentGlobeHost";

/*
 * Холст мокаем: он тянет three/WebGL, которых в jsdom нет. Мок отражает переданные пропы в
 * data-атрибуты, чтобы тест проверил, ЧЕМ хост кормит глобус (число дуг/городов, пауза), не
 * трогая сам WebGL. Холст в хосте ленивый — потому ждём его через `findByTestId`.
 */
type MockGlobeProps = {
  arcs?: readonly unknown[];
  labelCities?: readonly unknown[];
  paused?: boolean;
  interactive?: boolean;
};

vi.mock("./GlobeCanvas", () => ({
  GlobeCanvas: ({ arcs, labelCities, paused, interactive }: MockGlobeProps) => (
    <div
      data-testid="globe-canvas"
      data-arcs={arcs?.length ?? 0}
      data-cities={labelCities?.length ?? 0}
      data-paused={String(paused ?? false)}
      data-interactive={String(interactive ?? false)}
    />
  ),
}));

/** AuthContext залогиненного пользователя с заданным `sub` (по нему кэшируются города). */
function authedValue(sub: string): AuthContextValue {
  return makeAuthValue({ isAuthenticated: true, claims: { sub, email_verified: true, exp: 4_102_444_800 } });
}

function screenAttr(container: HTMLElement, attr: string): string | null {
  return container.querySelector(".persistent-globe")?.getAttribute(attr) ?? null;
}

describe("PersistentGlobeHost — грань по маршруту", () => {
  it.each([
    { route: "/", screen: "landing" },
    { route: "/login", screen: "login" },
    { route: "/signup", screen: "signup" },
    { route: "/whatever", screen: "landing" },
  ])("на $route ставит data-screen=$screen", ({ route, screen: expected }) => {
    const { container } = renderWithProviders(<PersistentGlobeHost />, { route, authValue: makeAuthValue() });

    expect(screenAttr(container, "data-screen")).toBe(expected);
  });

  it("на /home (залогинен) ставит грань home и держит глобус видимым", () => {
    const { container } = renderWithProviders(<PersistentGlobeHost />, {
      route: "/home",
      authValue: authedValue("user-1"),
    });

    expect(screenAttr(container, "data-screen")).toBe("home");
    expect(screenAttr(container, "data-visible")).toBe("true");
  });

  it("на /journeys прячет глобус (data-visible=false, грань остаётся home)", () => {
    const { container } = renderWithProviders(<PersistentGlobeHost />, {
      route: "/journeys",
      authValue: authedValue("user-1"),
    });

    expect(screenAttr(container, "data-screen")).toBe("home");
    expect(screenAttr(container, "data-visible")).toBe("false");
  });

  it.each([
    { route: "/home", interactive: "true" },
    { route: "/", interactive: "false" },
    { route: "/login", interactive: "false" },
    { route: "/signup", interactive: "false" },
    { route: "/journeys", interactive: "false" },
  ])("драг-вращение: на $route data-interactive=$interactive", ({ route, interactive }) => {
    const { container } = renderWithProviders(<PersistentGlobeHost />, {
      route,
      authValue: authedValue("user-1"),
    });

    expect(screenAttr(container, "data-interactive")).toBe(interactive);
  });
});

describe("PersistentGlobeHost — источник данных глобуса", () => {
  it("аноним получает курируемые дуги и города", async () => {
    renderWithProviders(<PersistentGlobeHost />, { route: "/", authValue: makeAuthValue() });

    const globe = await screen.findByTestId("globe-canvas");

    expect(Number(globe.getAttribute("data-arcs"))).toBeGreaterThan(0);
    expect(Number(globe.getAttribute("data-cities"))).toBeGreaterThan(0);
    expect(globe).toHaveAttribute("data-paused", "false");
  });

  it("залогиненный получает реальные города без дуг (fade-in по приходе /journeys/map)", async () => {
    renderWithProviders(<PersistentGlobeHost />, { route: "/home", authValue: authedValue("user-1") });

    const globe = await screen.findByTestId("globe-canvas");

    // Дуг у авторизованного нет; города приезжают асинхронно из journeys/map (Moscow + London).
    expect(globe).toHaveAttribute("data-arcs", "0");
    // Дашборд — единственная грань, где холсту передан interactive (драг-вращение).
    expect(globe).toHaveAttribute("data-interactive", "true");
    await waitFor(() => expect(globe).toHaveAttribute("data-cities", "2"));
  });

  it("ошибка загрузки городов не роняет глобус — остаётся без точек", async () => {
    server.use(http.get("/v1/journeys/map", () => HttpResponse.error()));

    renderWithProviders(<PersistentGlobeHost />, { route: "/home", authValue: authedValue("user-1") });

    const globe = await screen.findByTestId("globe-canvas");

    expect(globe).toHaveAttribute("data-cities", "0");
  });

  it("на /journeys глобус на паузе (рендер остановлен)", async () => {
    renderWithProviders(<PersistentGlobeHost />, { route: "/journeys", authValue: authedValue("user-1") });

    const globe = await screen.findByTestId("globe-canvas");

    expect(globe).toHaveAttribute("data-paused", "true");
  });
});

describe("PersistentGlobeHost — свежесть данных фона", () => {
  /** Считает обращения к карте и отдаёт указанное число городов в одной стране. */
  function countMapRequests(cityNames: string[]): () => number {
    let requests = 0;
    server.use(
      http.get("/v1/journeys/map", () => {
        requests += 1;
        return HttpResponse.json({
          countries: [
            {
              countryCode: "RU",
              cities: cityNames.map((name, index) => ({
                name,
                latitude: 55 + index,
                longitude: 37 + index,
                years: [2020],
              })),
            },
          ],
        });
      }),
    );

    return () => requests;
  }

  it("возврат на грань не перезапрашивает карту — фон живёт со снимка (staleTime: Infinity)", async () => {
    const requestCount = countMapRequests(["Moscow", "Kazan"]);
    const queryClient = createTestQueryClient();
    const options = { route: "/home", authValue: authedValue("user-1"), queryClient };

    const first = renderWithProviders(<PersistentGlobeHost />, options);
    await waitFor(() => expect(screen.getByTestId("globe-canvas")).toHaveAttribute("data-cities", "2"));
    first.unmount();

    renderWithProviders(<PersistentGlobeHost />, options);

    // Точки на месте сразу, из кэша — и второго запроса не было.
    expect(await screen.findByTestId("globe-canvas")).toHaveAttribute("data-cities", "2");
    expect(requestCount()).toBe(1);
  });

  it("инвалидация ключа карты обновляет фон, несмотря на бесконечную свежесть", async () => {
    // Так до глобуса доезжает поездка, добавленная в форме: `staleTime: Infinity` сам по себе
    // не обновился бы никогда, поэтому мутация инвалидирует общий ключ.
    const requestCount = countMapRequests(["Moscow"]);
    const queryClient = createTestQueryClient();
    renderWithProviders(<PersistentGlobeHost />, {
      route: "/home",
      authValue: authedValue("user-1"),
      queryClient,
    });
    await waitFor(() => expect(screen.getByTestId("globe-canvas")).toHaveAttribute("data-cities", "1"));

    countMapRequests(["Moscow", "London"]);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: getJourneysMapQueryKey() });
    });

    await waitFor(() => expect(screen.getByTestId("globe-canvas")).toHaveAttribute("data-cities", "2"));
    expect(requestCount()).toBe(1);
  });

  it("аноним карту не запрашивает вовсе", async () => {
    const requestCount = countMapRequests(["Moscow"]);

    renderWithProviders(<PersistentGlobeHost />, { route: "/", authValue: makeAuthValue() });

    await screen.findByTestId("globe-canvas");
    expect(requestCount()).toBe(0);
  });
});

describe("PersistentGlobeHost — каркас без WebGL", () => {
  it("рисует stage и scrim и скрыт от скринридера (aria-hidden)", () => {
    const { container } = renderWithProviders(<PersistentGlobeHost />, { route: "/", authValue: makeAuthValue() });

    expect(container.querySelector(".persistent-globe__stage")).not.toBeNull();
    expect(container.querySelector(".persistent-globe__scrim")).not.toBeNull();
    expect(container.querySelector(".persistent-globe")).toHaveAttribute("aria-hidden");
  });
});
