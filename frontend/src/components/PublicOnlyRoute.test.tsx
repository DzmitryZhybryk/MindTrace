import { describe, expect, it } from "vitest";

import { makeAuthValue, renderRoutes, screen } from "../test/render";
import type { AuthContextValue } from "../auth/useAuth";
import { PublicOnlyRoute } from "./PublicOnlyRoute";

function renderPublicOnly(authValue: AuthContextValue) {
  return renderRoutes({
    element: (
      <PublicOnlyRoute>
        <div>public-content</div>
      </PublicOnlyRoute>
    ),
    path: "/",
    landings: [{ path: "/home", label: "home-landing" }],
    authValue,
  });
}

describe("PublicOnlyRoute", () => {
  it("во время bootstrap не рендерит ни контент, ни редирект", () => {
    renderPublicOnly(makeAuthValue({ isBootstrapping: true }));

    expect(screen.queryByText("public-content")).not.toBeInTheDocument();
    expect(screen.queryByText("home-landing")).not.toBeInTheDocument();
  });

  it("анониму рендерит children", () => {
    renderPublicOnly(makeAuthValue({ isAuthenticated: false, isBootstrapping: false }));

    expect(screen.getByText("public-content")).toBeInTheDocument();
  });

  it("залогиненного уводит на /home", async () => {
    renderPublicOnly(makeAuthValue({ isAuthenticated: true, isBootstrapping: false }));

    expect(await screen.findByText("home-landing")).toBeInTheDocument();
    expect(screen.queryByText("public-content")).not.toBeInTheDocument();
  });
});
