import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import type { PlaceResponse, TransportType } from "../api/sdk";
import carIcon from "../assets/emoji/car.svg";
import planeIcon from "../assets/emoji/plane.svg";
import shipIcon from "../assets/emoji/ship.svg";
import { GLOBE_ATMOSPHERE_COLOR, GLOBE_BUMP_URL, GLOBE_TEXTURE_URL } from "./globe/constants";
import { centralAngleRad } from "./globe/geo";
import {
  altitudeForSeparation,
  apexScale,
  arcAltitude,
  buildTrail,
  CAMERA_MAX_ALTITUDE,
  CAMERA_MIN_ALTITUDE,
  greatCirclePoint,
  isRealPlace,
  type TrailPoint,
} from "./globe/route";
import "./journey-globe.css";

// Вид камеры по умолчанию, пока ни один город не выбран (нейтральный, без демо-маршрута).
const DEFAULT_VIEW = { lat: 20, lng: 0 };

// Иконка транспорта на глобусе = та же Noto-эмодзи, что в селекте формы (src/assets/emoji).
// Нативная ориентация (проверено рендером): машина и корабль — вид сбоку, нос ВЛЕВО
// (их нельзя крутить — перевернутся, только зеркалим по ходу); самолёт — диагональ,
// нос в ВЕРХ-ВПРАВО (~45°), его крутим на курс с офсетом 45°.
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
  land: { icon: carIcon, altitude: ARC_ALTITUDE_GROUND, durationMs: 5200, orient: "flip", nativeFacesRight: false },
  air: { icon: planeIcon, altitude: ARC_ALTITUDE_AIR, durationMs: 3600, orient: "rotate", nativeFacesRight: true },
  water: { icon: shipIcon, altitude: ARC_ALTITUDE_GROUND, durationMs: 6000, orient: "flip", nativeFacesRight: false },
};

// След транспорта — закатный акцент продукта (`--sun`, литералом: цвет уходит в
// материал three.js, где CSS-переменные не работают). Ярко-красный «флайт-трекер»
// заменён после разворота палитры: он был единственным чужим цветом на экране.
const TRAIL_COLOR = "#e8935c";
// Noto-самолёт нативно смотрит в верх-вправо (~45°); поворот к экранному курсу =
// atan2(dy,dx) + 45° (для иконки «нос вверх» офсет был бы 90°).
const ICON_ROTATION_OFFSET_DEG = 45;

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
type ScreenGlobe = { getScreenCoords?: (lat: number, lng: number, altitude?: number) => { x: number; y: number } };

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

interface JourneyGlobeProps {
  origin: PlaceResponse | null;
  destination: PlaceResponse | null;
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
 *
 * Чистая геометрия маршрута вынесена в globe/route.ts (покрыта unit-тестами); здесь —
 * только three/WebGL-императив (камера, анимация, DOM пинов/транспорта).
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
  const originReal = isRealPlace(origin);
  const destinationReal = isRealPlace(destination);
  const bothReal = originReal && destinationReal;
  // Маршрут (дуга + транспорт) — только когда выбраны оба города И среда передвижения.
  const showRoute = bothReal && !!transportType;

  const startLat = origin?.latitude ?? 0;
  const startLng = origin?.longitude ?? 0;
  const endLat = destination?.latitude ?? 0;
  const endLng = destination?.longitude ?? 0;

  // Угловое расстояние между городами — вход и для авто-зума камеры, и для высоты дуги.
  const separation = bothReal ? centralAngleRad(startLat, startLng, endLat, endLng) : 0;
  // Высоту дуги масштабируем по длине маршрута, иначе у близких городов при зуме дуга
  // станет вертикальным шпилем.
  const apexBase = transportType ? TRANSPORT_VISUAL[transportType].altitude : 0;
  const apex = apexBase * apexScale(separation);

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
          atmosphereColor={GLOBE_ATMOSPHERE_COLOR}
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
