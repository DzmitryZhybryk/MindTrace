import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";

import { placeLabel, usePlaceNames } from "../../api/placeNames";
import { getJourneysGlobeOptions } from "../../api/sdk";
import { useAuth } from "../../auth/useAuth";
import { ErrorBoundary } from "../ErrorBoundary";
import type { GlobePov } from "./GlobeCanvas";
import { useGlobeScene, type GlobeSlot } from "./globeScene";
import { CAMERA_MAX_ALTITUDE, isRealPlace, ROUTE_FADE_MS, routeCameraPov, type GlobeRoute } from "./route";
import { ROUTE_ARCS, ROUTE_CITIES, type GlobeCity } from "./routes";
import { citiesFromJourneysGlobe, type UserCityPoint } from "./userCities";
import "./persistent-globe.css";

/*
 * Холст — лениво, отдельным chunk'ом: three/react-globe.gl (~1.8 МБ) не должны попадать на
 * критический путь первой отрисовки НИ ОДНОГО экрана. Обёртка ниже (тёмный фон + кадрирование
 * по data-screen) — чистый CSS, появляется в первом кадре без WebGL; отсюда `fallback={null}`.
 */
const GlobeCanvas = lazy(() => import("./GlobeCanvas").then((m) => ({ default: m.GlobeCanvas })));

/**
 * «Экран» глобуса — грань камеры и кадрирование сферы (`data-screen`). Публичные грани
 * (landing/signup/login), авторизованный `home` и `journeyAdd` — колонка формы поездки,
 * кадрируемая по слоту, который публикует страница. Остальные `/journeys*` своей грани не
 * дают — там глобус прячется (`visible=false`), оставаясь на последней.
 */
type Screen = "landing" | "signup" | "login" | "home" | "journeyAdd";

// Стабильная ссылка на «точек нет»: `react-globe.gl` сравнивает данные слоя по идентичности,
// и новый `[]` на каждом рендере заставлял бы его пересобирать слой подписей впустую.
const NO_CITIES: GlobeCity[] = [];
const NO_USER_CITIES: UserCityPoint[] = [];

// Точка обзора камеры для каждой грани: разные стороны планеты, чтобы переход читался
// «перелётом». `home` — грань дашборда (наследует прежний HomeGlobe), отдельная от login,
// поэтому вход login→home идёт видимым перелётом камеры.
const SCREEN_POV: Record<Screen, GlobePov> = {
  landing: { lat: 22, lng: 24, altitude: 2.35 },
  signup: { lat: 44, lng: -34, altitude: 1.85 },
  login: { lat: 8, lng: 104, altitude: 1.95 },
  home: { lat: 25, lng: 20, altitude: CAMERA_MAX_ALTITUDE },
  journeyAdd: routeCameraPov(null),
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
 * `/journeys/add` с опубликованным слотом — грань `journeyAdd` (планета в колонке формы,
 * крутится рукой). Пока в форме не выбрано ни одного места, она вращается, как на дашборде;
 * с первым городом замирает — камера кадрирует маршрут, и вращение уводило бы его из кадра.
 * Без слота (узкий экран: колонка скрыта) и на остальных `/journeys*` (2D-`WorldMap`) глобус
 * спрятан. На auth-форме (login/signup) планета замирает спокойным фоном; лендинг и дашборд
 * вращаются. Драг-вращение — на дашборде и в форме поездки: на остальных гранях глобус чисто
 * декоративен и слой держит `pointer-events: none` (см. persistent-globe.css).
 */
function viewForPath(pathname: string, hasSlot: boolean, hasRoutePlace: boolean): GlobeView {
  if (pathname.startsWith("/journeys/add") && hasSlot) {
    return {
      screen: "journeyAdd",
      pov: SCREEN_POV.journeyAdd,
      autoRotate: !hasRoutePlace,
      interactive: true,
      visible: true,
    };
  }

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
 * CSS-переменные кадрирования грани `journeyAdd`: холст размером во вьюпорт лишь
 * переносится центром в центр слота — масштаб у него тот же, что на дашборде (см.
 * persistent-globe.css), поэтому уход на /home двигает сферу, а не меняет её размер.
 * Обрезка ограничивает холст прямоугольником слота — иначе на ближнем зуме текстура
 * просвечивала бы сквозь стекло формы.
 */
function slotFramingStyle(slot: GlobeSlot): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const offsetX = slot.left + slot.width / 2 - viewportWidth / 2;
  const offsetY = slot.top + slot.height / 2 - viewportHeight / 2;
  const right = viewportWidth - (slot.left + slot.width);
  const bottom = viewportHeight - (slot.top + slot.height);

  return {
    "--globe-slot-x": `${offsetX}px`,
    "--globe-slot-y": `${offsetY}px`,
    "--globe-slot-clip": `inset(${slot.top}px ${right}px ${bottom}px ${slot.left}px)`,
  } as CSSProperties;
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
  const { route, slot } = useGlobeScene();
  const hasRoutePlace = isRealPlace(route?.origin ?? null) || isRealPlace(route?.destination ?? null);
  const view = viewForPath(pathname, slot !== null, hasRoutePlace);
  const isJourneyAdd = view.screen === "journeyAdd";
  // На грани формы камера кадрирует маршрут; GlobeCanvas сравнивает pov по полям, не по ссылке.
  const pov = isJourneyAdd ? routeCameraPov(route) : view.pov;
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );

  /*
   * Уход с формы на дашборд: маршрут не пропадает, а гаснет, пока камера и рамка перелетают
   * на грань home. Переход ловится сменой грани прямо в рендере (а не эффектом — иначе один
   * кадр home прошёл бы без маршрута): в этом рендере сцена ещё держит маршрут формы —
   * страница очистит его в своём unmount-cleanup'е, уже после. Только на /home: выход из
   * аккаунта или уход на 2D-карту маршрут не удерживают (на login он лёг бы поверх
   * курируемых дуг).
   */
  const [previousScreen, setPreviousScreen] = useState<Screen>(view.screen);
  const [fadingRoute, setFadingRoute] = useState<GlobeRoute | null>(null);
  if (previousScreen !== view.screen) {
    setPreviousScreen(view.screen);
    const isLeavingToHome = previousScreen === "journeyAdd" && view.screen === "home" && view.visible;
    setFadingRoute(isLeavingToHome && !reducedMotion ? route : null);
  }

  useEffect(() => {
    if (fadingRoute === null) return;

    const timer = window.setTimeout(() => setFadingRoute(null), ROUTE_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [fadingRoute]);

  let canvasRoute: GlobeRoute | null = null;
  if (isJourneyAdd) {
    canvasRoute = route;
  } else if (fadingRoute !== null) {
    canvasRoute = fadingRoute;
  }

  // Фон снимок не обновляет — новая поездка доезжает сюда инвалидацией из формы, а не
  // рефетчем по маунту. Ошибку намеренно не разбираем: без точек глобус остаётся глобусом.
  const { data: userCityPoints = NO_USER_CITIES } = useQuery({
    ...getJourneysGlobeOptions(),
    enabled: isAuthenticated,
    staleTime: Infinity,
    select: citiesFromJourneysGlobe,
  });

  // Названия городов — тот же запрос и кэш, что у 2D-карты. Город, чьё название ещё
  // грузится или не пришло из-за сбоя, — точка без подписи; город, которого geo не знает, —
  // подписан как неизвестный.
  const { t } = useTranslation("common");
  const unknownLabel = t("map.unknownPlace");
  const nameOf = usePlaceNames(userCityPoints.map((city) => city.id));
  const userCities = useMemo(() => {
    const cities: GlobeCity[] = userCityPoints.map((city) => ({
      name: placeLabel(nameOf(city.id), unknownLabel),
      lat: city.lat,
      lng: city.lng,
    }));

    return cities.length > 0 ? cities : NO_CITIES;
  }, [userCityPoints, nameOf, unknownLabel]);

  // На грани формы — только маршрут, посещённые города не рисуем.
  let labelCities = isAuthenticated ? userCities : ROUTE_CITIES;
  if (isJourneyAdd) {
    labelCities = NO_CITIES;
  }

  return (
    <div
      className="persistent-globe"
      data-screen={view.screen}
      data-visible={view.visible}
      data-interactive={view.interactive}
      style={isJourneyAdd && slot !== null ? slotFramingStyle(slot) : undefined}
      aria-hidden
    >
      {/*
       * Обрезка — на отдельной НЕтрансформированной обёртке: clip-path на stage считался бы в
       * его локальных (масштабированных) координатах, а на самом хосте срезал бы и его ночь.
       */}
      <div className="persistent-globe__clip">
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
                labelCities={labelCities}
                route={canvasRoute}
                routeFading={!isJourneyAdd && fadingRoute !== null}
                pov={pov}
                // Появление на грани формы — подлётом к планете, а не только проявлением.
                reveal={isJourneyAdd}
                autoRotate={view.autoRotate}
                interactive={view.interactive}
                paused={!view.visible}
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      {/* Боковой скрим под форму (auth-экраны); на лендинге/дашборде прозрачен. */}
      <div className="persistent-globe__scrim" />
    </div>
  );
}
