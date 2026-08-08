import { describe, expect, it } from "vitest";

import { renderWithProviders, waitFor } from "../test/render";
import { DocumentTitle } from "./DocumentTitle";

/** Рендерит компонент на заданном маршруте и ждёт, пока он проставит заголовок. */
async function titleAt(route: string): Promise<string> {
  renderWithProviders(<DocumentTitle />, { route });
  await waitFor(() => expect(document.title).not.toBe(""));
  return document.title;
}

describe("DocumentTitle", () => {
  it("на лендинге ставит полный заголовок с оффером", async () => {
    // У корня нет «раздела» — там работает ветка с брендом впереди.
    expect(await titleAt("/")).toMatch(/^MyJourney — /u);
  });

  it("на /login ставит «раздел · бренд»", async () => {
    expect(await titleAt("/login")).toBe("Welcome back · MyJourney");
  });

  it("на /signup ставит «раздел · бренд»", async () => {
    expect(await titleAt("/signup")).toBe("Create account · MyJourney");
  });

  it("на /home ставит «раздел · бренд»", async () => {
    expect(await titleAt("/home")).toBe("Home · MyJourney");
  });

  it("на /journeys ставит заголовок раздела", async () => {
    expect(await titleAt("/journeys")).toBe("Journeys · MyJourney");
  });

  it("для /journeys/add берёт заголовок формы, а не раздела", async () => {
    // Порядок веток значим: /journeys/add начинается с /journeys, и при обратном
    // порядке проверок форма получила бы заголовок раздела.
    expect(await titleAt("/journeys/add")).toBe("New journey · MyJourney");
  });

  it("на неизвестном пути откатывается к заголовку лендинга", async () => {
    expect(await titleAt("/nope")).toMatch(/^MyJourney — /u);
  });
});
