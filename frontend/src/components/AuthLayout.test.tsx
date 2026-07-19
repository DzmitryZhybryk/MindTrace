import { describe, expect, it } from "vitest";

import { renderWithProviders, screen } from "../test/render";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  it("рендерит контент формы", () => {
    renderWithProviders(
      <AuthLayout side="left">
        <div>main content</div>
      </AuthLayout>,
    );

    expect(screen.getByText("main content")).toBeInTheDocument();
  });

  it("сторона формы попадает в data-side (парная кадрированию глобуса)", () => {
    const { container } = renderWithProviders(
      <AuthLayout side="right">
        <div>main content</div>
      </AuthLayout>,
    );

    expect(container.querySelector(".auth-layout")).toHaveAttribute("data-side", "right");
  });
});
