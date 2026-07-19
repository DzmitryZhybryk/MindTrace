import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Center, Loader } from "@mantine/core";

import { AuthProvider } from "./auth/AuthContext";
import { DocumentTitle } from "./components/DocumentTitle";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";

// Страницы грузятся лениво (dynamic import → отдельный chunk на маршрут), поэтому
// главный бандл несёт только каркас (router + провайдеры + Mantine-база). Тяжёлое —
// 3D-глобусы (three/react-globe.gl) и geojson-карта (~257 kB) — уезжает в chunk той
// страницы, где реально нужно, и не грузится, например, на /login.
const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
// Публичная зона: лейаут с персистентным глобусом-фоном + лендинг. Глобус тяжёлый
// (three/react-globe.gl), поэтому PublicLayout тоже ленивый — его chunk грузится
// только на публичных маршрутах, не на дашборде/journeys.
const PublicLayout = lazy(() =>
  import("./pages/PublicLayout").then((m) => ({ default: m.PublicLayout })),
);
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })),
);
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
        {/* Вне <Suspense>: заголовок вкладки должен обновиться сразу при смене маршрута,
            не дожидаясь загрузки chunk'а страницы. */}
        <DocumentTitle />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/*
             * Публичная зона под общим PublicLayout — персистентный глобус-фон и шапка
             * («Уровень 3») монтируются один раз и переживают навигацию внутри неё.
             * Поэтому переход лендинг → signup → login не перезагружает WebGL: камера
             * лишь перелетает к другой грани планеты.
             */}
            <Route element={<PublicLayout />}>
              <Route
                path="/"
                element={
                  <PublicOnlyRoute>
                    <LandingPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <PublicOnlyRoute>
                    <LoginPage />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/signup"
                element={
                  <PublicOnlyRoute>
                    <SignUpPage />
                  </PublicOnlyRoute>
                }
              />
            </Route>

            {/* Дашборд: переехал с «/» на «/home» (на «/» теперь публичный лендинг). */}
            <Route
              path="/home"
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

            {/*
             * Неизвестный путь. Без этого маршрута ни одна ветка не совпадала и React Router
             * рендерил пустоту: белый экран без шапки и без способа вернуться (nginx отдаёт
             * index.html на любой URL, так что попасть сюда можно опечаткой в адресе или
             * старой ссылкой). Уводим на корень — аноним попадёт на лендинг, залогиненный
             * оттуда же уедет на дашборд. Отдельная страница 404 — продуктовое решение
             * (нужен свой копирайт в EN/RU), здесь сознательно не изобретаем.
             */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
