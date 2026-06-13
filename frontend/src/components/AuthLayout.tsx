import { Box, Center } from "@mantine/core";
import type { ReactNode } from "react";

import { AuthGlobe } from "./AuthGlobe";
import { ErrorBoundary } from "./ErrorBoundary";

interface AuthLayoutProps {
  header: ReactNode;
  children: ReactNode;
}

/**
 * Двухколоночный каркас auth-экранов: слева хедер + центрированный контент,
 * справа (от md) — глобус. Глобус обёрнут в локальный `ErrorBoundary`: сбой
 * WebGL/three.js не должен ронять форму — вместо глобуса покажем тёмную панель.
 */
export function AuthLayout({ header, children }: AuthLayoutProps) {
  return (
    <Box style={{ display: "flex", minHeight: "100vh", background: "var(--auth-page-bg)" }}>
      <Box
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          position: "relative",
        }}
      >
        <Box style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1 }}>{header}</Box>

        <Center style={{ flex: 1, padding: "24px", width: "100%" }}>{children}</Center>
      </Box>

      <Box visibleFrom="md" style={{ flex: 1, padding: 16, display: "flex" }}>
        <Box style={{ flex: 1, borderRadius: 24, overflow: "hidden" }}>
          <ErrorBoundary
            fallback={
              <div style={{ width: "100%", height: "100%", background: "var(--globe-bg)" }} />
            }
          >
            <AuthGlobe />
          </ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
