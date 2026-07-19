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
    {/*
      Тёмная схема — не косметика, а выравнивание Mantine с поверхностью продукта.
      Пока схема была светлой, её дефолты (белая коробка чекбокса, серая disabled-кнопка,
      почти чёрный текст ошибки) приходилось перебивать вручную на каждой тёмной
      поверхности. Теперь они работают в ту же сторону, что и дизайн.
    */}
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <ErrorBoundary fallback={<RootErrorFallback />}>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </MantineProvider>
  </StrictMode>
);
