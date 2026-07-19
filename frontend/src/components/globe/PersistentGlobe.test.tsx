import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/render";
import { PersistentGlobe } from "./PersistentGlobe";

// Холст мокаем: он тянет three/WebGL, которых в jsdom нет. Под тестом здесь другое —
// выбор грани планеты по маршруту и каркас, который должен появиться БЕЗ WebGL.
vi.mock("./GlobeCanvas", () => ({ GlobeCanvas: () => null }));

/** Значение `data-screen` на обёртке — им CSS выбирает кадрирование сферы. */
function screenAttr(container: HTMLElement): string | null {
  return container.querySelector(".persistent-globe")?.getAttribute("data-screen") ?? null;
}

describe("PersistentGlobe", () => {
  it("на лендинге показывает грань landing", () => {
    const { container } = renderWithProviders(<PersistentGlobe />, { route: "/" });

    expect(screenAttr(container)).toBe("landing");
  });

  it("на /login показывает грань login", () => {
    const { container } = renderWithProviders(<PersistentGlobe />, { route: "/login" });

    expect(screenAttr(container)).toBe("login");
  });

  it("на /signup показывает грань signup", () => {
    const { container } = renderWithProviders(<PersistentGlobe />, { route: "/signup" });

    expect(screenAttr(container)).toBe("signup");
  });

  it("на незнакомом пути откатывается к грани landing", () => {
    const { container } = renderWithProviders(<PersistentGlobe />, { route: "/whatever" });

    expect(screenAttr(container)).toBe("landing");
  });

  it("каркас и скрим рисуются без WebGL", () => {
    // Смысл ленивой загрузки холста: тёмная подложка и кадрирование — чистый CSS и
    // обязаны быть в первом кадре, до того как приедет three.
    const { container } = renderWithProviders(<PersistentGlobe />, { route: "/" });

    expect(container.querySelector(".persistent-globe__stage")).not.toBeNull();
    expect(container.querySelector(".persistent-globe__scrim")).not.toBeNull();
  });

  it("глобус скрыт от скринридера как декоративный", () => {
    const { container } = renderWithProviders(<PersistentGlobe />, { route: "/" });

    expect(container.querySelector(".persistent-globe")).toHaveAttribute("aria-hidden");
  });
});
