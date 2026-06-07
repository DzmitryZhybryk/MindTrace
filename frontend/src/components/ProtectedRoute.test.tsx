import { describe, expect, it } from "vitest";

import { makeAuthValue, renderRoutes, screen } from "../test/render";
import type { AuthContextValue } from "../auth/useAuth";
import { ProtectedRoute } from "./ProtectedRoute";

function renderProtected(authValue: AuthContextValue) {
  return renderRoutes({
    element: (
      <ProtectedRoute>
        <div>protected-content</div>
      </ProtectedRoute>
    ),
    path: "/",
    landings: [{ path: "/login", label: "login-landing" }],
    authValue,
  });
}

describe("ProtectedRoute", () => {
  it("во время bootstrap не рендерит ни контент, ни редирект", () => {
    renderProtected(makeAuthValue({ isBootstrapping: true }));

    expect(screen.queryByText("protected-content")).not.toBeInTheDocument();
    expect(screen.queryByText("login-landing")).not.toBeInTheDocument();
  });

  it("неавторизованного редиректит на /login", async () => {
    renderProtected(makeAuthValue({ isAuthenticated: false, isBootstrapping: false }));

    expect(await screen.findByText("login-landing")).toBeInTheDocument();
    expect(screen.queryByText("protected-content")).not.toBeInTheDocument();
  });

  it("авторизованному рендерит children", () => {
    renderProtected(makeAuthValue({ isAuthenticated: true, isBootstrapping: false }));

    expect(screen.getByText("protected-content")).toBeInTheDocument();
  });
});
