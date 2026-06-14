import { describe, expect, it, vi } from "vitest";

import { renderWithProviders, screen } from "../test/render";
import { ErrorBoundary } from "./ErrorBoundary";

/** Компонент, падающий в рендере — для проверки перехвата boundary'ем. */
function Boom(): never {
  throw new Error("render boom");
}

describe("ErrorBoundary", () => {
  it("рендерит детей, когда ошибки нет", () => {
    renderWithProviders(
      <ErrorBoundary fallback={<div>fallback</div>}>
        <div>healthy child</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("healthy child")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).not.toBeInTheDocument();
  });

  it("показывает fallback, когда ребёнок падает в рендере", () => {
    // React печатает пойманную ошибку в console.error — глушим, чтобы не зашумлять вывод.
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(
      <ErrorBoundary fallback={<div>fallback shown</div>}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText("fallback shown")).toBeInTheDocument();
  });
});
