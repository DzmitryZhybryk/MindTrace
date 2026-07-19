import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import { GLOBE_ATMOSPHERE_COLOR, GLOBE_BUMP_URL, GLOBE_TEXTURE_URL } from "./constants";
import { applyLabelVisibility, createGlobeLabel } from "./globeLabel";
import type { City, RouteArc } from "./routes";
import "./globe-label.css";
import "./globe-canvas.css";

export interface GlobePov {
  lat: number;
  lng: number;
  altitude: number;
}

/*
 * Пропсов ровно столько, сколько кто-то передаёт. Раньше их было семь: `autoRotateSpeed`,
 * `povDurationMs` и `className` не передавал ни один из двух потребителей — они жили как
 * заготовка «на будущее», но читались как поддерживаемая настройка. Вернуть любой из них —
 * две строки, а неиспользуемая опция обязывает её не сломать.
 */
interface GlobeCanvasProps {
  /** Дуги маршрутов (`arcsData`); по умолчанию нет. */
  arcs?: RouteArc[];
  /** Города-концы для подписей (точка + название с окклюзией); по умолчанию нет. */
  labelCities?: City[];
  /** Автовращение (гасится при prefers-reduced-motion). */
  autoRotate?: boolean;
  /** Точка обзора камеры. Первая установка мгновенна, смена — плавный перелёт. */
  pov?: GlobePov;
}

const DEFAULT_POV: GlobePov = { lat: 22, lng: 24, altitude: 2.3 };
/** Скорость автовращения и длительность перелёта камеры — общие для всех глобусов. */
const AUTO_ROTATE_SPEED = 0.42;
const POV_FLIGHT_MS = 1400;
const ARC_COLOR: [string, string] = ["rgba(246, 177, 122, 0.95)", "rgba(111, 143, 214, 0.55)"];
// Стабильные пустые ссылки — чтобы дефолты не пересоздавали массивы на каждый рендер.
const EMPTY_ARCS: RouteArc[] = [];
const EMPTY_CITIES: City[] = [];

/*
 * Аксессоры — модульные константы, а НЕ стрелки в JSX. globe.gl сравнивает аксессоры по
 * идентичности: новая функция на каждый рендер читается как «правило отрисовки сменилось»,
 * и слой перестраивается целиком. Для `htmlElement` это значит снос и пересборку DOM всех
 * подписей — на ровном месте, просто потому что родитель перерисовался (а он перерисовывается
 * на каждой смене маршрута: `PersistentGlobe` сидит на `useLocation`).
 */
const arcColorAccessor = (): [string, string] => ARC_COLOR;
const arcDashInitialGapAccessor = (d: object): number => (d as RouteArc).dashInitialGap;
const cityLatAccessor = (d: object): number => (d as City).lat;
const cityLngAccessor = (d: object): number => (d as City).lng;
const cityLabelAccessor = (d: object): HTMLElement => createGlobeLabel((d as City).name);

/**
 * Общая база декоративного 3D-глобуса (signature продукта). Инкапсулирует замер
 * контейнера, тёплую тонировку, атмосферу, блок зума скроллом, reduced-motion,
 * автовращение и перелёты камеры (pov). Опционально рисует дуги маршрутов и подписи
 * городов-концов (HTML-метки с окклюзией дальней стороны). Потребители — HomeGlobe,
 * hero лендинга, персистентный глобус auth-зоны.
 */
export function GlobeCanvas({
  arcs = EMPTY_ARCS,
  labelCities = EMPTY_CITIES,
  autoRotate = true,
  pov = DEFAULT_POV,
}: GlobeCanvasProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasSetPovRef = useRef(false);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || size.width === 0 || size.height === 0) return;

    const controls = globe.controls();
    controls.autoRotate = autoRotate && !reducedMotion;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    controls.enableZoom = false;

    // Первая установка — мгновенно; последующие смены pov — плавный перелёт.
    const duration = hasSetPovRef.current && !reducedMotion ? POV_FLIGHT_MS : 0;
    globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude }, duration);
    hasSetPovRef.current = true;
  }, [
    size.width,
    size.height,
    reducedMotion,
    autoRotate,
    pov.lat,
    pov.lng,
    pov.altitude,
  ]);

  /*
   * Колесо мыши над глобусом раньше глушилось безусловно — и это работало ровно наоборот
   * задуманному. В публичной зоне слушатель мёртв: `.persistent-globe` объявлен
   * `pointer-events: none`, поэтому событие туда не доходит вовсе. А на дашборде и в
   * форме поездки, где глобус интерактивен, `preventDefault` съедал прокрутку СТРАНИЦЫ:
   * пользователь наводил курсор на планету и переставал скроллить экран.
   *
   * Зум скроллом и так выключен через `controls.enableZoom = false` (см. эффект выше) —
   * то есть блокировать было нечего. Слушатель убран: страница прокручивается везде.
   */

  /*
   * Скрытая вкладка не должна крутить WebGL. Сам по себе rAF в фоне тормозится браузером,
   * но не гарантированно (в фоновом окне поверх другого он продолжает идти), а сцена здесь
   * анимирована всегда: автовращение плюс бегущий пунктир дуг. Останавливаем явно — это
   * заметная разница по батарее на вкладке, забытой открытой.
   */
  useEffect(() => {
    const handleVisibility = () => {
      const globe = globeRef.current;
      if (!globe) return;

      if (document.hidden) {
        globe.pauseAnimation();
      } else {
        globe.resumeAnimation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return (
    <div ref={containerRef} className="globe-canvas">
      {size.width > 0 && size.height > 0 && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={GLOBE_TEXTURE_URL}
          bumpImageUrl={GLOBE_BUMP_URL}
          showAtmosphere
          atmosphereColor={GLOBE_ATMOSPHERE_COLOR}
          atmosphereAltitude={0.24}
          arcsData={arcs}
          arcColor={arcColorAccessor}
          arcAltitudeAutoScale={0.42}
          arcStroke={0.6}
          arcDashLength={0.55}
          arcDashGap={0.35}
          arcDashInitialGap={arcDashInitialGapAccessor}
          arcDashAnimateTime={reducedMotion ? 0 : 3800}
          arcsTransitionDuration={0}
          htmlElementsData={labelCities}
          htmlLat={cityLatAccessor}
          htmlLng={cityLngAccessor}
          htmlAltitude={0}
          htmlElement={cityLabelAccessor}
          htmlElementVisibilityModifier={applyLabelVisibility}
        />
      )}
    </div>
  );
}
