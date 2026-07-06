import { Box, Center } from "@mantine/core";
import { lazy, Suspense, type ReactNode } from "react";

import { ErrorBoundary } from "./ErrorBoundary";

// Глобус (three/react-globe.gl) — отдельный chunk, грузится лениво ПОСЛЕ рендера формы,
// чтобы тяжёлый WebGL не блокировал критический путь auth-экрана.
const AuthGlobe = lazy(() => import("./AuthGlobe").then((m) => ({ default: m.AuthGlobe })));

// Тёмная панель-заглушка на месте глобуса: и пока грузится его chunk (Suspense), и если
// WebGL/three упал (ErrorBoundary) — тот же размерный блок, без сдвига layout (CLS).
const globeFallback = <div style={{ width: "100%", height: "100%", background: "var(--globe-bg)" }} />;

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
          <ErrorBoundary fallback={globeFallback}>
            <Suspense fallback={globeFallback}>
              <AuthGlobe />
            </Suspense>
          </ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}
