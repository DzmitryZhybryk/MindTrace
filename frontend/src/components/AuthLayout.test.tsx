import { describe, expect, it, vi } from "vitest";

import { renderWithProviders, screen } from "../test/render";
import { AuthLayout } from "./AuthLayout";

// AuthGlobe тянет react-globe.gl/three.js (WebGL, в jsdom не работает) — мокаем заглушкой.
// vi.mock хойстится выше импортов, поэтому AuthLayout получает мок при импорте AuthGlobe.
vi.mock("./AuthGlobe", () => ({
  AuthGlobe: () => <div>globe stub</div>,
}));

describe("AuthLayout", () => {
  it("рендерит слот хедера и контент", () => {
    renderWithProviders(
      <AuthLayout header={<div>header slot</div>}>
        <div>main content</div>
      </AuthLayout>,
    );

    expect(screen.getByText("header slot")).toBeInTheDocument();
    expect(screen.getByText("main content")).toBeInTheDocument();
  });
});
