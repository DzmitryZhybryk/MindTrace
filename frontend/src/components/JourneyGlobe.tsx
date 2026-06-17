import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import type { CitySuggestion, TransportType } from "../api/journeys";
import carIcon from "../assets/emoji/car.svg";
import planeIcon from "../assets/emoji/plane.svg";
import shipIcon from "../assets/emoji/ship.svg";
import "./journey-globe.css";

const GLOBE_TEXTURE_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
const GLOBE_BUMP_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

// Вид камеры по умолчанию, пока ни один город не выбран (нейтральный, без демо-маршрута).
const DEFAULT_VIEW = { lat: 20, lng: 0 };

// --- Камера: авто-зум по близости городов ----------------------------------
// Чем ближе города, тем сильнее зум: altitude подбираем так, чтобы маршрут занимал
// ~ROUTE_VIEWPORT_SPAN долю обзора, в пределах [MIN, MAX]. Порог «когда зум включается» —
// та дистанция, на которой формула опускается ниже MAX (дальше держим дальний вид).
// MIN — граница максимального приближения (ближе города уже не приближаем).
const CAMERA_FOV_DEG = 50; // поле зрения камеры three.js в globe.gl
// Целевая доля обзора под маршрут (больше → ближе зум). 0.10: Минск–Москву (~675 км)
// слегка приближает (altitude ~1.2), маршруты длиннее ~1000 км остаются в широком виде,
// близкие города приближаются заметно сильнее. Тюнится «на глаз».
const ROUTE_VIEWPORT_SPAN = 0.1;
const CAMERA_MAX_ALTITUDE = 1.7; // дальний предел: города далеко / выбран один (текущий вид)
const CAMERA_MIN_ALTITUDE = 0.12; // ближний предел: ближе города не приближаем
// Высота дуги нормируется на этот угловой размер: у дальних маршрутов дуга «полная»,
// у близких масштабируется вниз, иначе при зуме превратится в вертикальный шпиль.
const ARC_REFERENCE_SEPARATION_RAD = (50 * Math.PI) / 180;

// Иконка транспорта на глобусе = та же Noto-эмодзи, что в селекте формы (src/assets/emoji).
// Нативная ориентация (проверено рендером): машина — вид сбоку, нос ВПРАВО; корабль —
// вид сбоку, нос ВЛЕВО (их нельзя крутить — перевернутся, только зеркалим по ходу);
// самолёт — диагональ, нос в ВЕРХ-ВПРАВО (~45°), его крутим на курс с офсетом 45°.
// orient: "rotate" — иконку крутим на экранный курс; "flip" — держим вертикально и
// зеркалим. nativeFacesRight — куда смотрит боковая иконка в SVG (для flip).
type TransportVisual = {
  icon: string;
  altitude: number;
  durationMs: number;
  orient: "rotate" | "flip";
  nativeFacesRight: boolean;
};

// Высота дуги (apex): у самолёта заметная, у машины/корабля вдвое меньше — трасса более
// плоская. Камеру под маршрут НЕ доворачиваем (спрямление давало неожиданные ракурсы).
const ARC_ALTITUDE_AIR = 0.14;
const ARC_ALTITUDE_GROUND = ARC_ALTITUDE_AIR / 2;
const TRANSPORT_VISUAL: Record<TransportType, TransportVisual> = {
  land: { icon: carIcon, altitude: ARC_ALTITUDE_GROUND, durationMs: 5200, orient: "flip", nativeFacesRight: true },
  air: { icon: planeIcon, altitude: ARC_ALTITUDE_AIR, durationMs: 3600, orient: "rotate", nativeFacesRight: true },
  water: { icon: shipIcon, altitude: ARC_ALTITUDE_GROUND, durationMs: 6000, orient: "flip", nativeFacesRight: false },
};

// Ярко-красный «флайт-трекер» — общий для следа и иконки транспорта (тот же hex
// продублирован в .journey-vehicle__icon). Яркий, чтобы читался на тёмном океане.
const TRAIL_COLOR = "#ff3b30";
const TRAIL_SAMPLES = 96;
// Noto-самолёт нативно смотрит в верх-вправо (~45°); поворот к экранному курсу =
// atan2(dy,dx) + 45° (для иконки «нос вверх» офсет был бы 90°).
const ICON_ROTATION_OFFSET_DEG = 45;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

type LabelSide = "left" | "right";
type HtmlDatum = {
  type: "pin" | "vehicle";
  lat: number;
  lng: number;
  alt: number;
  name?: string;
  icon?: string;
  side?: LabelSide;
};
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Угловое расстояние (радианы) между двумя точками — central angle (haversine). */
function angularDistance(startLat: number, startLng: number, endLat: number, endLng: number): number {
  const phi1 = startLat * DEG;
  const phi2 = endLat * DEG;
  const dPhi = (endLat - startLat) * DEG;
  const dLam = (endLng - startLng) * DEG;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Высота камеры (globe.gl altitude) под угловой размер маршрута: ближе города → меньше
 * altitude (сильнее зум). Геометрия — камера на расстоянии d от центра видит концы
 * маршрута под углом targetHalfAngle; результат зажат в [MIN, MAX].
 */
function altitudeForSeparation(separationRad: number): number {
  if (separationRad <= 0) {
    return CAMERA_MAX_ALTITUDE;
  }

  const targetHalfAngle = (ROUTE_VIEWPORT_SPAN * CAMERA_FOV_DEG * DEG) / 2;
  const half = separationRad / 2;
  const cameraDistance = Math.cos(half) + Math.sin(half) / Math.tan(targetHalfAngle);
  return clamp(cameraDistance - 1, CAMERA_MIN_ALTITUDE, CAMERA_MAX_ALTITUDE);
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

function createPinElement(name: string, side: LabelSide): HTMLElement {
  const wrapper = document.createElement("div");
  // Подпись кладём на сторону, противоположную маршруту (side), чтобы не перекрывать дугу.
  wrapper.className = side === "left" ? "journey-pin journey-pin--left" : "journey-pin";

  const dot = document.createElement("span");
  dot.className = "journey-pin__dot";

  const label = document.createElement("span");
  label.className = "journey-pin__name";
  label.textContent = name;

  wrapper.append(dot, label);
  return wrapper;
}

/** Город «реальный» (выбран из автокомплита), если у него есть координаты. */
function isRealCity(city: CitySuggestion | null): city is CitySuggestion {
  return city !== null && (city.latitude !== 0 || city.longitude !== 0);
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
 * иконка повёрнута по направлению движения, камера кадрирует маршрут. Пины и подписи
 * появляются только для реально выбранных городов; маршрут (дуга + транспорт) — когда
 * выбраны оба города и среда передвижения. На пустой форме глобус чистый.
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

  // Пины и маршрут показываем только для реально выбранных городов — на пустой
  // форме глобус чистый (без демо-маршрута и подписей «Откуда»/«Куда»).
  const originReal = isRealCity(origin);
  const destinationReal = isRealCity(destination);
  const bothReal = originReal && destinationReal;
  // Маршрут (дуга + транспорт) — только когда выбраны оба города И среда передвижения.
  const showRoute = bothReal && !!transportType;

  const startLat = origin?.latitude ?? 0;
  const startLng = origin?.longitude ?? 0;
  const endLat = destination?.latitude ?? 0;
  const endLng = destination?.longitude ?? 0;

  // Угловое расстояние между городами — вход и для авто-зума камеры, и для высоты дуги.
  const separation = bothReal ? angularDistance(startLat, startLng, endLat, endLng) : 0;
  // Высоту дуги масштабируем по длине маршрута (sqrt — чтобы средние маршруты не были
  // слишком плоскими), иначе у близких городов при зуме дуга станет вертикальным шпилем.
  const apexBase = transportType ? TRANSPORT_VISUAL[transportType].altitude : 0;
  const apex = apexBase * Math.sqrt(Math.min(1, separation / ARC_REFERENCE_SEPARATION_RAD));

  // Подпись каждого пина — на сторону, противоположную второму концу, чтобы текст не
  // ложился на дугу. Восточнее (бо́льшая долгота) ≈ правее на экране (камера на середине).
  const originSide: LabelSide = endLng > startLng ? "left" : "right";
  const destinationSide: LabelSide = startLng > endLng ? "left" : "right";

  // Метки концов: стабильная identity в пределах координат/подписи (на смену ввода
  // three-globe пересоберёт DOM с новым текстом), внутри анимации DOM переиспользуется.
  const pins = useMemo<HtmlDatum[]>(() => {
    const result: HtmlDatum[] = [];
    if (originReal) {
      result.push({ type: "pin", lat: startLat, lng: startLng, alt: 0.01, name: originLabel, side: originSide });
    }

    if (destinationReal) {
      result.push({ type: "pin", lat: endLat, lng: endLng, alt: 0.01, name: destinationLabel, side: destinationSide });
    }

    return result;
  }, [
    originReal,
    destinationReal,
    startLat,
    startLng,
    endLat,
    endLng,
    originLabel,
    destinationLabel,
    originSide,
    destinationSide,
  ]);

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

    // Камера: середина маршрута (оба города), либо единственный выбранный город,
    // либо нейтральный вид по умолчанию, пока ничего не выбрано.
    let target = DEFAULT_VIEW;
    let altitude = CAMERA_MAX_ALTITUDE;
    if (bothReal) {
      target = greatCirclePoint(startLat, startLng, endLat, endLng, 0.5);
      // Чем ближе города — тем сильнее зум (altitude падает к CAMERA_MIN_ALTITUDE).
      altitude = altitudeForSeparation(separation);
    } else if (originReal) {
      target = { lat: startLat, lng: startLng };
    } else if (destinationReal) {
      target = { lat: endLat, lng: endLng };
    }

    // На дальнем зуме чуть смещаем центр к экватору (вид «парой к форме»); на ближнем —
    // центрируем ровно на маршруте, иначе зум уведёт города из кадра.
    const zoomT = (altitude - CAMERA_MIN_ALTITUDE) / (CAMERA_MAX_ALTITUDE - CAMERA_MIN_ALTITUDE);
    const latFactor = 1 - 0.4 * zoomT;
    globe.pointOfView({ lat: target.lat * latFactor, lng: target.lng, altitude }, 1200);
  }, [bothReal, originReal, destinationReal, startLat, startLng, endLat, endLng, separation, size.width, size.height]);

  // Движение транспорта + поворот иконки по экранному курсу.
  useEffect(() => {
    if (!showRoute || !transportType) {
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
  }, [showRoute, transportType, vehicle, apex, startLat, startLng, endLat, endLng, reducedMotion]);

  // Новый массив на каждый ре-рендер (его триггерит setFrame): pins/vehicle —
  // стабильные объекты, three-globe переиспользует их DOM, меняются лишь координаты.
  const htmlData: HtmlDatum[] = showRoute ? [...pins, vehicle] : pins;
  const pathsData = showRoute
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
              return createPinElement(item.name ?? "", item.side ?? "right");
            }

            const wrapper = document.createElement("div");
            wrapper.className = "journey-vehicle";
            const icon = document.createElement("div");
            icon.className = "journey-vehicle__icon";
            // Та же Noto-эмодзи, что в селекте — как <img> (поворот/зеркало вешаем на icon-div).
            const img = document.createElement("img");
            img.src = item.icon ?? "";
            img.alt = "";
            icon.appendChild(img);
            wrapper.appendChild(icon);
            vehicleIconElRef.current = icon;
            return wrapper;
          }}
        />
      )}
    </div>
  );
}
