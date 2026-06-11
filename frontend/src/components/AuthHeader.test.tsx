import { describe, expect, it } from "vitest";

import { renderWithProviders, screen } from "../test/render";
import { AuthHeader } from "./AuthHeader";

function renderHeader() {
  return renderWithProviders(
    <AuthHeader hint="Need an account?" actionLabel="Sign Up" actionHref="/signup" />,
  );
}

describe("AuthHeader", () => {
  it("рендерит hint и action-ссылку с правильным href", () => {
    renderHeader();

    expect(screen.getByText("Need an account?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/signup");
  });

  it("рендерит BrandMark со ссылкой на главную", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: /MyJ/iu })).toHaveAttribute("href", "/");
  });
});
