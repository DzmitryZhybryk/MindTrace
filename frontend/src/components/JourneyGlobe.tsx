import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import type { CitySuggestion, TransportType } from "../api/journeys";
import "./journey-globe.css";

const GLOBE_TEXTURE_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
const GLOBE_BUMP_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

// Демо-маршрут, пока автокомплит не отдаёт реальные координаты: Лондон → Нью-Йорк.
// Подписи берутся из ввода формы; координаты станут реальными, как только город
// выбран в автокомплите (geonameId > 0).
const DEMO_ORIGIN = { lat: 51.5074, lng: -0.1278 };
const DEMO_DESTINATION = { lat: 40.7128, lng: -74.006 };

// Нативная ориентация (проверено рендером): самолёт — top-down, нос ВВЕРХ (его
// крутим полным курсом); корабль и машина — вид СБОКУ (нос влево / перёд вправо),
// их нельзя крутить (перевернутся), только зеркалить по ходу движения.
// Источники: самолёт — Material Symbols `flight` (Google, Apache 2.0); парусник и
// машина — game-icons.net (Delapouite, CC BY 3.0). У game-icons снят чёрный фон-квадрат.
const PLANE_SVG =
  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
const SHIP_SVG =
  '<svg viewBox="0 0 512 512"><path fill="currentColor" d="M199.256 74.5v285H27.744l25.998 78H380.255l104-78h-267v-285h-18zm18 18c36.787 88.85 64.94 216 0 250h208c22-34-11.905-164.76-208-250zm-36 0c-33.046 69.333-50 200-144 250h144v-250z"/></svg>';
const CAR_SVG =
  '<svg viewBox="0 0 512 512"><path fill="currentColor" d="M188.287 169.428c-28.644-.076-60.908 2.228-98.457 8.01-4.432.62-47.132 24.977-58.644 41.788-11.512 16.812-15.45 48.813-15.45 48.813-3.108 13.105-1.22 34.766-.353 36.872 1.17 4.56 7.78 8.387 19.133 11.154C35.84 295.008 53.29 278.6 74.39 278.574c22.092 0 40 17.91 40 40-.014 1.764-.145 3.525-.392 5.272.59.008 1.26.024 1.82.03l239.266 1.99c-.453-2.405-.685-4.845-.693-7.292 0-22.09 17.91-40 40-40 22.092 0 40 17.91 40 40 0 2.668-.266 5.33-.796 7.944l62.186.517c1.318-22.812 6.86-46.77-7.024-66.72-5.456-7.84-31.93-22.038-99.03-32.66-34.668-17.41-68.503-37.15-105.35-48.462-28.41-5.635-59.26-9.668-96.09-9.765zm-17.197 11.984c5.998.044 11.5.29 16.014.81l7.287 48.352c-41.43-5.093-83.647-9.663-105.964-27.5.35-5.5 7.96-13.462 16.506-16.506 4.84-1.724 40.167-5.346 66.158-5.156zm34.625.348c25.012.264 62.032 2.69 87.502 13.94 12.202 5.65 35.174 18.874 50.537 30.55l-6.35 10.535c-41.706-1.88-97.288-4.203-120.1-6.78l-11.59-48.245zM74.39 294.574a24 24 0 0 0-24 24 24 24 0 0 0 24 24 24 24 0 0 0 24-24 24 24 0 0 0-24-24zm320 0a24 24 0 0 0-24 24 24 24 0 0 0 24 24 24 24 0 0 0 24-24 24 24 0 0 0-24-24z"/></svg>';

// orient: "rotate" — top-down иконка крутится на полный курс; "flip" — боковая иконка
// держится вертикально и зеркалится. nativeFacesRight — куда смотрит боковая иконка в SVG.
type TransportVisual = {
  icon: string;
  altitude: number;
  durationMs: number;
  orient: "rotate" | "flip";
  nativeFacesRight: boolean;
};

// Радиус траектории объёмный только у воздуха; земля и вода — одинаково минимальный.
const ARC_ALTITUDE_GROUND = 0.12;
const TRANSPORT_VISUAL: Record<TransportType, TransportVisual> = {
  land: { icon: CAR_SVG, altitude: ARC_ALTITUDE_GROUND, durationMs: 5200, orient: "flip", nativeFacesRight: true },
  air: { icon: PLANE_SVG, altitude: 0.44, durationMs: 3600, orient: "rotate", nativeFacesRight: true },
  water: { icon: SHIP_SVG, altitude: ARC_ALTITUDE_GROUND, durationMs: 6000, orient: "flip", nativeFacesRight: false },
};

// Ярко-красный «флайт-трекер» — общий для следа и иконки транспорта (тот же hex
// продублирован в .journey-vehicle__icon). Яркий, чтобы читался на тёмном океане.
const TRAIL_COLOR = "#ff3b30";
const TRAIL_SAMPLES = 96;
// SVG-иконки смотрят «вверх» (−Y); поворот к экранному курсу = atan2(dy,dx) + 90°.
const ICON_ROTATION_OFFSET_DEG = 90;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

type HtmlDatum = { type: "pin" | "vehicle"; lat: number; lng: number; alt: number; name?: string; icon?: string };
type TrailPoint = { lat: number; lng: number; alt: number };
type ScreenGlobe = { getScreenCoords?: (lat: number, lng: number, altitude?: number) => { x: number; y: number } };

/** Точка на большом круге между двумя координатами при параметре t ∈ [0, 1] (slerp). */
function greatCirclePoint(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  t: number,
): { lat: number; lng: number } {
  const phi1 = startLat * DEG;
  const lam1 = startLng * DEG;
  const phi2 = endLat * DEG;
  const lam2 = endLng * DEG;

  const a = Math.sin((phi2 - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (delta < 1e-6) {
    return { lat: startLat, lng: startLng };
  }

  const ka = Math.sin((1 - t) * delta) / Math.sin(delta);
  const kb = Math.sin(t * delta) / Math.sin(delta);
  const x = ka * Math.cos(phi1) * Math.cos(lam1) + kb * Math.cos(phi2) * Math.cos(lam2);
  const y = ka * Math.cos(phi1) * Math.sin(lam1) + kb * Math.cos(phi2) * Math.sin(lam2);
  const z = ka * Math.sin(phi1) + kb * Math.sin(phi2);

  return { lat: Math.atan2(z, Math.hypot(x, y)) * RAD, lng: Math.atan2(y, x) * RAD };
}

/** Высота над поверхностью в точке маршрута: 0 на концах, апекс в середине. */
function arcAltitude(t: number, apex: number): number {
  return Math.sin(Math.PI * t) * apex;
}

function buildTrail(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  apex: number,
  progress: number,
): TrailPoint[] {
  const points: TrailPoint[] = [];
  for (let i = 0; i <= TRAIL_SAMPLES; i += 1) {
    const tau = i / TRAIL_SAMPLES;
    if (tau > progress) break;

    const point = greatCirclePoint(startLat, startLng, endLat, endLng, tau);
    points.push({ lat: point.lat, lng: point.lng, alt: arcAltitude(tau, apex) });
  }

  // Голову следа фиксируем ровно под иконкой (точный progress, а не ближайший сэмпл).
  const head = greatCirclePoint(startLat, startLng, endLat, endLng, progress);
  points.push({ lat: head.lat, lng: head.lng, alt: arcAltitude(progress, apex) });
  return points;
}

function createPinElement(name: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "journey-pin";

  const dot = document.createElement("span");
  dot.className = "journey-pin__dot";

  const label = document.createElement("span");
  label.className = "journey-pin__name";
  label.textContent = name;

  wrapper.append(dot, label);
  return wrapper;
}

interface JourneyGlobeProps {
  origin: CitySuggestion | null;
  destination: CitySuggestion | null;
  transportType: TransportType | null;
  originLabel: string;
  destinationLabel: string;
}

/**
 * Глобус-герой страницы добавления поездки: иконка транспорта летит/едет/плывёт по
 * great-circle траектории, оставляя за собой растущий красный пунктирный след;
 * иконка повёрнута по направлению движения, камера кадрирует маршрут. Пока транспорт
 * не выбран — только два пина (без линии). Демо Лондон → Нью-Йорк до автокомплита.
 */
export function JourneyGlobe({ origin, destination, transportType, originLabel, destinationLabel }: JourneyGlobeProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const vehicleIconElRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef(0);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  // Инкремент покадрово пересобирает данные следа/транспорта (three-globe пересчитывает
  // позиции только при set данных). Значение само по себе не используется.
  const [, setFrame] = useState(0);
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );

  const hasRealRoute =
    !!origin &&
    !!destination &&
    (origin.latitude !== 0 || origin.longitude !== 0) &&
    (destination.latitude !== 0 || destination.longitude !== 0);

  const startLat = hasRealRoute ? origin.latitude : DEMO_ORIGIN.lat;
  const startLng = hasRealRoute ? origin.longitude : DEMO_ORIGIN.lng;
  const endLat = hasRealRoute ? destination.latitude : DEMO_DESTINATION.lat;
  const endLng = hasRealRoute ? destination.longitude : DEMO_DESTINATION.lng;
  const apex = transportType ? TRANSPORT_VISUAL[transportType].altitude : 0;

  // Метки концов: стабильная identity в пределах координат/подписи (на смену ввода
  // three-globe пересоберёт DOM с новым текстом), внутри анимации DOM переиспользуется.
  const pins = useMemo<HtmlDatum[]>(
    () => [
      { type: "pin", lat: startLat, lng: startLng, alt: 0.01, name: originLabel },
      { type: "pin", lat: endLat, lng: endLng, alt: 0.01, name: destinationLabel },
    ],
    [startLat, startLng, endLat, endLng, originLabel, destinationLabel],
  );

  // Транспорт: identity завязана на иконку (смена среды → новый DOM с новым SVG).
  // Координаты — изменяемые поля, их покадрово мутирует rAF.
  const vehicle = useMemo<HtmlDatum>(
    () => ({ type: "vehicle", lat: 0, lng: 0, alt: 0, icon: transportType ? TRANSPORT_VISUAL[transportType].icon : "" }),
    [transportType],
  );

  // Замер контейнера — глобус рисуем только после получения ненулевого размера.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Блокируем зум колесом/пинчем — глобус тут декоративный, не интерактивная карта.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const blockWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", blockWheel, { passive: false });
    return () => el.removeEventListener("wheel", blockWheel);
  }, []);

  // Настройка controls + кадрирование камеры на середину маршрута при его смене.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || size.width === 0 || size.height === 0) return;

    const controls = globe.controls();
    controls.autoRotate = false;
    controls.enableZoom = false;

    const mid = greatCirclePoint(startLat, startLng, endLat, endLng, 0.5);
    // Меньшая altitude = крупнее сфера: вертикальный размах глобуса совпадает с формой,
    // и он читается как пара к ней, а не как маленький «висящий» шар по центру сцены.
    globe.pointOfView({ lat: mid.lat * 0.6, lng: mid.lng, altitude: 1.7 }, 1200);
  }, [startLat, startLng, endLat, endLng, size.width, size.height]);

  // Движение транспорта + поворот иконки по экранному курсу.
  useEffect(() => {
    if (!transportType) {
      progressRef.current = 0;
      return;
    }

    const config = TRANSPORT_VISUAL[transportType];

    const orientIcon = (t: number) => {
      const globe = globeRef.current as ScreenGlobe | undefined;
      const iconEl = vehicleIconElRef.current;
      if (!globe?.getScreenCoords || !iconEl) return;

      const aheadT = t < 1 ? Math.min(1, t + 0.012) : t - 0.012;
      const here = greatCirclePoint(startLat, startLng, endLat, endLng, t);
      const ahead = greatCirclePoint(startLat, startLng, endLat, endLng, aheadT);
      const a = globe.getScreenCoords(here.lat, here.lng, arcAltitude(t, apex));
      const b = globe.getScreenCoords(ahead.lat, ahead.lng, arcAltitude(aheadT, apex));
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (t >= 1) {
        dx = -dx;
        dy = -dy;
      }

      if (config.orient === "rotate") {
        // Top-down (самолёт): нос вверх → крутим на полный экранный курс.
        const angle = Math.atan2(dy, dx) * RAD + ICON_ROTATION_OFFSET_DEG;
        iconEl.style.transform = `rotate(${angle}deg)`;
      } else {
        // Вид сбоку (машина/корабль): держим вертикально, только зеркалим по ходу
        // движения — иначе при движении в обратную сторону перевернётся вверх ногами.
        const facesRight = dx >= 0;
        const flip = facesRight === config.nativeFacesRight ? 1 : -1;
        iconEl.style.transform = `scaleX(${flip})`;
      }
    };

    const place = (t: number) => {
      const point = greatCirclePoint(startLat, startLng, endLat, endLng, t);
      vehicle.lat = point.lat;
      vehicle.lng = point.lng;
      vehicle.alt = arcAltitude(t, apex);
      progressRef.current = t;
      orientIcon(t);
    };

    if (reducedMotion) {
      place(1);
      setFrame((f) => f + 1);
      return;
    }

    const durationMs = config.durationMs;
    let raf = 0;
    let startTs = 0;
    const loop = (ts: number) => {
      if (startTs === 0) startTs = ts;
      place(((ts - startTs) % durationMs) / durationMs);
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [transportType, vehicle, apex, startLat, startLng, endLat, endLng, reducedMotion]);

  // Новый массив на каждый ре-рендер (его триггерит setFrame): pins/vehicle —
  // стабильные объекты, three-globe переиспользует их DOM, меняются лишь координаты.
  const htmlData: HtmlDatum[] = transportType ? [pins[0], pins[1], vehicle] : pins;
  const pathsData = transportType
    ? [{ coords: buildTrail(startLat, startLng, endLat, endLng, apex, progressRef.current) }]
    : [];

  return (
    <div ref={containerRef} className="journey-globe">
      {size.width > 0 && size.height > 0 && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={GLOBE_TEXTURE_URL}
          bumpImageUrl={GLOBE_BUMP_URL}
          showAtmosphere
          atmosphereColor="#4ab3ff"
          atmosphereAltitude={0.2}
          pathsData={pathsData}
          pathPoints={(d: object) => (d as { coords: TrailPoint[] }).coords}
          pathPointLat={(p: unknown) => (p as TrailPoint).lat}
          pathPointLng={(p: unknown) => (p as TrailPoint).lng}
          pathPointAlt={(p: unknown) => (p as TrailPoint).alt}
          pathColor={() => TRAIL_COLOR}
          pathDashLength={0.05}
          pathDashGap={0.02}
          pathDashAnimateTime={reducedMotion ? 0 : 1600}
          pathTransitionDuration={0}
          htmlElementsData={htmlData as unknown as object[]}
          htmlLat={(d: object) => (d as HtmlDatum).lat}
          htmlLng={(d: object) => (d as HtmlDatum).lng}
          htmlAltitude={(d: object) => (d as HtmlDatum).alt}
          htmlElement={(d: object) => {
            const item = d as HtmlDatum;
            if (item.type !== "vehicle") {
              return createPinElement(item.name ?? "");
            }

            const wrapper = document.createElement("div");
            wrapper.className = "journey-vehicle";
            const icon = document.createElement("div");
            icon.className = "journey-vehicle__icon";
            // Доверенный константный SVG (не пользовательский ввод) — XSS невозможен.
            icon.innerHTML = item.icon ?? "";
            wrapper.appendChild(icon);
            vehicleIconElRef.current = icon;
            return wrapper;
          }}
        />
      )}
    </div>
  );
}
