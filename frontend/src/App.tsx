import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Center, Loader } from "@mantine/core";

import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Страницы грузятся лениво (dynamic import → отдельный chunk на маршрут), поэтому
// главный бандл несёт только каркас (router + провайдеры + Mantine-база). Тяжёлое —
// 3D-глобусы (three/react-globe.gl) и geojson-карта (~257 kB) — уезжает в chunk той
// страницы, где реально нужно, и не грузится, например, на /login.
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const AddJourneyPage = lazy(() =>
  import("./pages/journeys/AddJourneyPage").then((m) => ({ default: m.AddJourneyPage })),
);
const JourneysLayout = lazy(() =>
  import("./pages/journeys/JourneysLayout").then((m) => ({ default: m.JourneysLayout })),
);
const JourneysMapView = lazy(() =>
  import("./pages/journeys/JourneysMapView").then((m) => ({ default: m.JourneysMapView })),
);
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const SignUpPage = lazy(() => import("./pages/SignUpPage").then((m) => ({ default: m.SignUpPage })));

// Пока грузится chunk маршрута — центрированный лоадер во весь экран.
function PageFallback() {
  return (
    <Center style={{ minHeight: "100vh" }}>
      <Loader />
    </Center>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            {/*
             * Раздел Journeys — общий каркас (шапка + панель) с под-вкладками через
             * <Outlet/>. Индексный маршрут показывает карту, «add» — форму добавления
             * поездки; movements/all/wishlist пока заглушки (element={null}) — маршруты
             * заведены, чтобы навигация в панели подсвечивалась, контент появится по мере готовности.
             */}
            <Route
              path="/journeys"
              element={
                <ProtectedRoute>
                  <JourneysLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<JourneysMapView />} />
              <Route path="movements" element={null} />
              <Route path="all" element={null} />
              <Route path="wishlist" element={null} />
              <Route path="add" element={<AddJourneyPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
