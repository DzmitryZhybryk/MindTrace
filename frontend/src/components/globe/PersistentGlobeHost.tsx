import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { useLocation } from "react-router";

import { getJourneysMapOptions } from "../../api/sdk";
import { useAuth } from "../../auth/useAuth";
import { ErrorBoundary } from "../ErrorBoundary";
import type { GlobePov } from "./GlobeCanvas";
import { ROUTE_ARCS, ROUTE_CITIES, type GlobeCity } from "./routes";
import { citiesFromJourneysMap } from "./userCities";
import "./persistent-globe.css";

/*
 * Холст — лениво, отдельным chunk'ом: three/react-globe.gl (~1.8 МБ) не должны попадать на
 * критический путь первой отрисовки НИ ОДНОГО экрана. Обёртка ниже (тёмный фон + кадрирование
 * по data-screen) — чистый CSS, появляется в первом кадре без WebGL; отсюда `fallback={null}`.
 */
const GlobeCanvas = lazy(() => import("./GlobeCanvas").then((m) => ({ default: m.GlobeCanvas })));

/**
 * «Экран» глобуса — грань камеры и кадрирование сферы (`data-screen`). Публичные грани
 * (landing/signup/login) плюс авторизованный `home`. `/journeys*` не даёт своей грани —
 * там глобус прячется (`visible=false`), оставаясь на последней.
 */
type Screen = "landing" | "signup" | "login" | "home";

// Стабильная ссылка на «точек нет»: `react-globe.gl` сравнивает данные слоя по идентичности,
// и новый `[]` на каждом рендере заставлял бы его пересобирать слой подписей впустую.
const NO_CITIES: GlobeCity[] = [];

// Точка обзора камеры для каждой грани: разные стороны планеты, чтобы переход читался
// «перелётом». `home` — грань дашборда (наследует прежний HomeGlobe), отдельная от login,
// поэтому вход login→home идёт видимым перелётом камеры.
const SCREEN_POV: Record<Screen, GlobePov> = {
  landing: { lat: 22, lng: 24, altitude: 2.35 },
  signup: { lat: 44, lng: -34, altitude: 1.85 },
  login: { lat: 8, lng: 104, altitude: 1.95 },
  home: { lat: 25, lng: 20, altitude: 2.4 },
};

interface GlobeView {
  screen: Screen;
  pov: GlobePov;
  autoRotate: boolean;
  /** Драг-вращение курсором/пальцем. Включено только там, где планета — главный объект экрана. */
  interactive: boolean;
  /** Виден ли глобус-фон. `false` на `/journeys*` — там его место занимает 2D-карта/форма. */
  visible: boolean;
}

/**
 * Выбирает грань, режим вращения, интерактивность и видимость по текущему пути.
 *
 * `/journeys*` прячет глобус (там 2D-`WorldMap` и форма поездки со своим `JourneyGlobe`).
 * На auth-форме (login/signup) планета замирает спокойным фоном; лендинг и дашборд вращаются.
 * Драг-вращение — только на дашборде: на остальных гранях глобус чисто декоративен и слой
 * держит `pointer-events: none` (см. persistent-globe.css).
 */
function viewForPath(pathname: string): GlobeView {
  if (pathname.startsWith("/journeys")) {
    // Спрятан и на паузе — вращение ему не нужно (защита на случай, если пауза не успела встать).
    return { screen: "home", pov: SCREEN_POV.home, autoRotate: false, interactive: false, visible: false };
  }

  if (pathname.startsWith("/home")) {
    return { screen: "home", pov: SCREEN_POV.home, autoRotate: true, interactive: true, visible: true };
  }

  if (pathname.startsWith("/signup")) {
    return { screen: "signup", pov: SCREEN_POV.signup, autoRotate: false, interactive: false, visible: true };
  }

  if (pathname.startsWith("/login")) {
    return { screen: "login", pov: SCREEN_POV.login, autoRotate: false, interactive: false, visible: true };
  }

  return { screen: "landing", pov: SCREEN_POV.landing, autoRotate: true, interactive: false, visible: true };
}

/**
 * App-global персистентный глобус-фон. Смонтирован один раз на корне (сиблинг `<Routes>`) и
 * НЕ размонтируется ни при какой навигации — камера перелетает между гранями (`pov`), а
 * WebGL-инстанс живёт непрерывно, включая переход `/login` → `/home` после логина.
 *
 * Источник точек зависит от авторизации: аноним видит курируемые маршруты
 * (`ROUTE_ARCS`/`ROUTE_CITIES`), залогиненный — свои реальные посещённые города без дуг
 * (дуги маршрутов — отдельная будущая задача). Реальные города приходят из общего с 2D-картой
 * запроса `/v1/journeys/map`; кэш и его сброс на смене сессии держит Query (см. `AuthProvider`).
 */
export function PersistentGlobeHost() {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const view = viewForPath(pathname);

  // Тот же queryKey, что у 2D-карты (`JourneysMapView`), но своя свежесть: фон снимок
  // не обновляет — новая поездка доезжает сюда инвалидацией из формы, а не рефетчем по
  // маунту. Ошибку намеренно не разбираем: без точек глобус остаётся глобусом.
  const { data: userCities = NO_CITIES } = useQuery({
    ...getJourneysMapOptions(),
    enabled: isAuthenticated,
    staleTime: Infinity,
    select: citiesFromJourneysMap,
  });

  return (
    <div
      className="persistent-globe"
      data-screen={view.screen}
      data-visible={view.visible}
      data-interactive={view.interactive}
      aria-hidden
    >
      {/* Кадрирование сферы (сдвиг/масштаб) задаёт CSS по data-screen. */}
      <div className="persistent-globe__stage">
        {/*
         * Boundary ровно вокруг холста: сбой WebGL/three.js (или chunk'а GlobeCanvas) гасит
         * только сферу, а CSS-слой хоста — ночной градиент, кадрирование по data-screen и
         * скрим под auth-форму — живёт без WebGL. Fallback не нужен: фон и так держит хост.
         */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <GlobeCanvas
              arcs={isAuthenticated ? undefined : ROUTE_ARCS}
              labelCities={isAuthenticated ? userCities : ROUTE_CITIES}
              pov={view.pov}
              autoRotate={view.autoRotate}
              interactive={view.interactive}
              paused={!view.visible}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Боковой скрим под форму (auth-экраны); на лендинге/дашборде прозрачен. */}
      <div className="persistent-globe__scrim" />
    </div>
  );
}
