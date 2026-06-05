import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import App from "./App.tsx";
import { theme } from "./theme";
import "./i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </MantineProvider>
  </StrictMode>
);
