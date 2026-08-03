import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router";

import { useAuth } from "../../auth/useAuth";
import type { GlobePov } from "./GlobeCanvas";
import { ROUTE_ARCS, ROUTE_CITIES, type GlobeCity } from "./routes";
import { clearUserCitiesCache, getCachedUserCities, loadUserCities } from "./userCities";
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
  /** Виден ли глобус-фон. `false` на `/journeys*` — там его место занимает 2D-карта/форма. */
  visible: boolean;
}

/**
 * Выбирает грань, режим вращения и видимость по текущему пути.
 *
 * `/journeys*` прячет глобус (там 2D-`WorldMap` и форма поездки со своим `JourneyGlobe`).
 * На auth-форме (login/signup) планета замирает спокойным фоном; лендинг и дашборд вращаются.
 */
function viewForPath(pathname: string): GlobeView {
  if (pathname.startsWith("/journeys")) {
    // Спрятан и на паузе — вращение ему не нужно (защита на случай, если пауза не успела встать).
    return { screen: "home", pov: SCREEN_POV.home, autoRotate: false, visible: false };
  }

  if (pathname.startsWith("/home")) {
    return { screen: "home", pov: SCREEN_POV.home, autoRotate: true, visible: true };
  }

  if (pathname.startsWith("/signup")) {
    return { screen: "signup", pov: SCREEN_POV.signup, autoRotate: false, visible: true };
  }

  if (pathname.startsWith("/login")) {
    return { screen: "login", pov: SCREEN_POV.login, autoRotate: false, visible: true };
  }

  return { screen: "landing", pov: SCREEN_POV.landing, autoRotate: true, visible: true };
}

/**
 * App-global персистентный глобус-фон. Смонтирован один раз на корне (сиблинг `<Routes>`) и
 * НЕ размонтируется ни при какой навигации — камера перелетает между гранями (`pov`), а
 * WebGL-инстанс живёт непрерывно, включая переход `/login` → `/home` после логина.
 *
 * Источник точек зависит от авторизации: аноним видит курируемые маршруты
 * (`ROUTE_ARCS`/`ROUTE_CITIES`), залогиненный — свои реальные посещённые города без дуг
 * (дуги маршрутов — отдельная будущая задача). Реальные города тянутся из `/v1/journeys/map`
 * один раз на `sub` и кэшируются, логаут кэш чистит.
 */
export function PersistentGlobeHost() {
  const { pathname } = useLocation();
  const { isAuthenticated, claims } = useAuth();
  const sub = claims?.sub ?? null;
  const view = viewForPath(pathname);

  // Синхронный старт из кэша — при повторном входе на /home точки уже на месте, без мигания.
  const [userCities, setUserCities] = useState<GlobeCity[]>(() => (sub !== null ? getCachedUserCities(sub) ?? [] : []));

  useEffect(() => {
    if (!isAuthenticated || sub === null) {
      // Логаут / аноним: сбрасываем кэш и локальные точки, чтобы города не «протекли»
      // в следующую сессию под другим аккаунтом.
      clearUserCitiesCache();
      setUserCities([]);
      return;
    }

    const cachedCities = getCachedUserCities(sub);
    if (cachedCities !== null) {
      setUserCities(cachedCities);
      return;
    }

    let mounted = true;
    loadUserCities(sub)
      .then((cities) => {
        if (mounted) {
          setUserCities(cities);
        }
      })
      .catch(() => {
        if (mounted) {
          setUserCities([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, sub]);

  return (
    <div className="persistent-globe" data-screen={view.screen} data-visible={view.visible} aria-hidden>
      {/* Кадрирование сферы (сдвиг/масштаб) задаёт CSS по data-screen. */}
      <div className="persistent-globe__stage">
        <Suspense fallback={null}>
          <GlobeCanvas
            arcs={isAuthenticated ? undefined : ROUTE_ARCS}
            labelCities={isAuthenticated ? userCities : ROUTE_CITIES}
            pov={view.pov}
            autoRotate={view.autoRotate}
            paused={!view.visible}
          />
        </Suspense>
      </div>

      {/* Боковой скрим под форму (auth-экраны); на лендинге/дашборде прозрачен. */}
      <div className="persistent-globe__scrim" />
    </div>
  );
}
