import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RootErrorFallback } from "./components/RootErrorFallback";
import { theme } from "./theme";
import "./i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ErrorBoundary fallback={<RootErrorFallback />}>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </MantineProvider>
  </StrictMode>
);
