import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";

import type { GlobePov } from "./GlobeCanvas";
import { ROUTE_ARCS, ROUTE_CITIES } from "./routes";
import "./persistent-globe.css";

/*
 * Сам холст — лениво, отдельным chunk'ом. Публичная зона (лендинг, login, signup) иначе
 * тянула бы three/react-globe.gl СИНХРОННО: `PublicLayout` статически импортирует этот
 * модуль, поэтому текст hero не мог отрисоваться, пока не распарсится ~1.8 МБ движка.
 * Ленивым сделан именно холст, а не весь `PersistentGlobe`: обёртка ниже несёт тёмный
 * фон и кадрирование по `data-screen` — они чистый CSS, должны появиться в первом кадре
 * и без WebGL. Отсюда же `fallback={null}` — заливка обёртки УЖЕ на месте, подставлять
 * под неё вторую заглушку не нужно, иначе на стыке моргнёт.
 *
 * `GlobePov` берём отдельным `import type`: при `verbatimModuleSyntax` он стирается
 * компилятором и рантайм-импорт модуля не создаёт.
 */
const GlobeCanvas = lazy(() => import("./GlobeCanvas").then((m) => ({ default: m.GlobeCanvas })));

/** Публичный «экран» — определяет грань камеры и кадрирование сферы (data-screen). */
type Screen = "landing" | "signup" | "login";

// Точка обзора камеры для каждой публичной грани. Разные
// грани планеты, чтобы переход между экранами читался «перелётом» (GlobeCanvas сам
// плавно доводит pov; кадрирование `.persistent-globe__stage` едет transition'ом).
const SCREEN_POV: Record<Screen, GlobePov> = {
  landing: { lat: 22, lng: 24, altitude: 2.35 },
  signup: { lat: 44, lng: -34, altitude: 1.85 },
  login: { lat: 8, lng: 104, altitude: 1.95 },
};

interface GlobeView {
  screen: Screen;
  pov: GlobePov;
  autoRotate: boolean;
}

/**
 * Выбирает экран, грань и режим вращения по текущему пути. Вращается только лендинг —
 * на auth-экранах планета замирает спокойным фоном за формой (появятся в Phase 3).
 */
function viewForPath(pathname: string): GlobeView {
  if (pathname.startsWith("/signup")) {
    return { screen: "signup", pov: SCREEN_POV.signup, autoRotate: false };
  }

  if (pathname.startsWith("/login")) {
    return { screen: "login", pov: SCREEN_POV.login, autoRotate: false };
  }

  return { screen: "landing", pov: SCREEN_POV.landing, autoRotate: true };
}

/**
 * Персистентный глобус публичной зоны («Уровень 3»). Смонтирован один раз в
 * `PublicLayout` и НЕ размонтируется при навигации между её роутами — меняется
 * лишь `pov`, отчего камера перелетает к новой грани, а WebGL-инстанс и анимация
 * дуг живут непрерывно. Декоративный фон: `pointer-events: none` в CSS, чтобы
 * контент поверх свободно скроллился и кликался.
 */
export function PersistentGlobe() {
  const { pathname } = useLocation();
  const { screen, pov, autoRotate } = viewForPath(pathname);

  return (
    <div className="persistent-globe" data-screen={screen} aria-hidden>
      {/* Кадрирование сферы (сдвиг/масштаб) задаёт CSS по data-screen — как в прототипе flow. */}
      <div className="persistent-globe__stage">
        <Suspense fallback={null}>
          <GlobeCanvas arcs={ROUTE_ARCS} labelCities={ROUTE_CITIES} pov={pov} autoRotate={autoRotate} />
        </Suspense>
      </div>

      {/*
        Скрим — затемнение с той стороны, где всплывает форма: без него текст на стекле
        конкурирует с дугами за спиной. Только для auth-экранов; на лендинге прозрачен,
        там свой градиент в `.lp-hero__scrim`.
      */}
      <div className="persistent-globe__scrim" />
    </div>
  );
}
