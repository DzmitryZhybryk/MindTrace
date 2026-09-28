import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GlobeMethods } from "react-globe.gl";

import type { TransportType } from "../../api/sdk";
import carIcon from "../../assets/emoji/car.svg";
import planeIcon from "../../assets/emoji/plane.svg";
import shipIcon from "../../assets/emoji/ship.svg";
import { centralAngleRad } from "./geo";
import {
  apexScale,
  arcAltitude,
  buildTrail,
  greatCirclePoint,
  isRealPlace,
  ROUTE_FADE_MS,
  type GlobeRoute,
  type TrailPoint,
} from "./route";
import "./globe-route.css";

/*
 * Императивная часть сцены маршрута на глобусе: DOM пинов и транспорта, rAF-движение
 * транспорта и поворот его иконки по экранному курсу. Чистая геометрия — в route.ts (покрыта
 * unit-тестами); этот модуль исключён из покрытия (vite.config.ts): three/WebGL-рендер и
 * `getScreenCoords` в jsdom не исполняются.
 */

// Иконка транспорта = та же Noto-эмодзи, что в селекте формы (src/assets/emoji).
// Нативная ориентация (проверено рендером): машина и корабль — вид сбоку, нос ВЛЕВО
// (их нельзя крутить — перевернутся, только зеркалим по ходу); самолёт — диагональ,
// нос в ВЕРХ-ВПРАВО (~45°), его крутим на курс с офсетом 45°.
type TransportVisual = {
  icon: string;
  altitude: number;
  durationMs: number;
  orient: "rotate" | "flip";
  nativeFacesRight: boolean;
};

// Высота дуги (apex): у самолёта заметная, у машины/корабля вдвое меньше — трасса более плоская.
const ARC_ALTITUDE_AIR = 0.14;
const ARC_ALTITUDE_GROUND = ARC_ALTITUDE_AIR / 2;
const TRANSPORT_VISUAL: Record<TransportType, TransportVisual> = {
  land: { icon: carIcon, altitude: ARC_ALTITUDE_GROUND, durationMs: 5200, orient: "flip", nativeFacesRight: false },
  air: { icon: planeIcon, altitude: ARC_ALTITUDE_AIR, durationMs: 3600, orient: "rotate", nativeFacesRight: true },
  water: { icon: shipIcon, altitude: ARC_ALTITUDE_GROUND, durationMs: 6000, orient: "flip", nativeFacesRight: false },
};

// След транспорта — закатный акцент продукта (`--sun`, литералом: цвет уходит в материал
// three.js, где CSS-переменные не работают). RGB без альфы — альфу добавляет угасание.
const TRAIL_RGB = "232, 147, 92";

// Noto-самолёт нативно смотрит в верх-вправо (~45°); поворот к экранному курсу = atan2(dy,dx) + 45°.
const ICON_ROTATION_OFFSET_DEG = 45;
// Шаг «вперёд по курсу» для расчёта направления иконки (доля пути).
const HEADING_LOOKAHEAD = 0.012;
const PIN_ALTITUDE = 0.01;
const RAD = 180 / Math.PI;

/** Класс-маркер DOM-элементов маршрута: по нему модификатор видимости отличает их от подписей. */
const ROUTE_ELEMENT_CLASS = "globe-route";
const VEHICLE_ICON_CLASS = "globe-route-vehicle__icon";

type LabelSide = "left" | "right";

/** Элемент маршрута в html-слое globe.gl (общем с подписями городов). */
export interface RouteHtmlDatum {
  kind: "route-pin" | "route-vehicle";
  lat: number;
  lng: number;
  alt: number;
  name?: string;
  icon?: string;
  side?: LabelSide;
}

export interface RouteTrail {
  coords: TrailPoint[];
  /** rgba-цвет следа: альфа падает к нулю, пока маршрут гаснет. */
  color: string;
}

export function isRouteDatum(datum: object): datum is RouteHtmlDatum {
  return "kind" in datum;
}

function createPinElement(name: string, side: LabelSide): HTMLElement {
  const wrapper = document.createElement("div");
  // Подпись — на сторону, противоположную маршруту (side), чтобы не перекрывать дугу.
  wrapper.className =
    side === "left" ? `${ROUTE_ELEMENT_CLASS} globe-route-pin globe-route-pin--left` : `${ROUTE_ELEMENT_CLASS} globe-route-pin`;

  const dot = document.createElement("span");
  dot.className = "globe-route-pin__dot";

  const label = document.createElement("span");
  label.className = "globe-route-pin__name";
  label.textContent = name;

  wrapper.append(dot, label);
  return wrapper;
}

function createVehicleElement(icon: string): HTMLElement {
  // Внешний контейнер позиционирует three-globe, поворот по курсу — на вложенной иконке.
  const wrapper = document.createElement("div");
  wrapper.className = `${ROUTE_ELEMENT_CLASS} globe-route-vehicle`;

  const iconEl = document.createElement("div");
  iconEl.className = VEHICLE_ICON_CLASS;

  const img = document.createElement("img");
  img.src = icon;
  img.alt = "";

  iconEl.appendChild(img);
  wrapper.appendChild(iconEl);
  return wrapper;
}

/** DOM элемента маршрута для `htmlElement` globe.gl. */
export function createRouteElement(datum: RouteHtmlDatum): HTMLElement {
  if (datum.kind === "route-vehicle") {
    return createVehicleElement(datum.icon ?? "");
  }

  return createPinElement(datum.name ?? "", datum.side ?? "right");
}

export function isRouteElement(el: HTMLElement): boolean {
  return el.classList.contains(ROUTE_ELEMENT_CLASS);
}

/**
 * Окклюзия дальней стороны для элементов маршрута — мгновенно, без fade: так их прятал
 * globe.gl по умолчанию (`obj.visible`), пока у слоя не было модификатора. Inline-opacity
 * при этом не трогаем — она остаётся свободной под угасание маршрута.
 */
export function applyRouteVisibility(el: HTMLElement, isVisible: boolean): void {
  el.style.visibility = isVisible ? "" : "hidden";
}

interface RouteSceneOptions {
  route: GlobeRoute | null;
  globeRef: RefObject<GlobeMethods | undefined>;
  containerRef: RefObject<HTMLDivElement | null>;
  reducedMotion: boolean;
  /** Маршрут гаснет (уход с формы): след теряет альфу за ROUTE_FADE_MS, транспорт едет дальше. */
  fading: boolean;
}

interface RouteScene {
  /** Пины и транспорт для html-слоя; пусто, если реальных мест нет. */
  htmlData: RouteHtmlDatum[];
  /** След транспорта для `pathsData`; пусто, пока маршрут не полный. */
  trails: RouteTrail[];
}

const NO_ROUTE_HTML: RouteHtmlDatum[] = [];
const NO_TRAILS: RouteTrail[] = [];

/**
 * Сцена маршрута: пины только для реально выбранных мест; дуга и транспорт — когда выбраны
 * оба места и среда передвижения. Транспорт летит/едет/плывёт по great-circle траектории,
 * оставляя растущий пунктирный след; иконка повёрнута по направлению движения.
 *
 * Пока маршрут анимируется, хук форсирует ре-рендер владельца каждый кадр: three-globe
 * пересчитывает позиции только при set данных.
 */
export function useRouteScene({
  route,
  globeRef,
  containerRef,
  reducedMotion,
  fading,
}: RouteSceneOptions): RouteScene {
  const progressRef = useRef(0);
  const trailAlphaRef = useRef(1);
  // Инкремент покадрово пересобирает данные следа/транспорта. Значение само по себе не используется.
  const [, setFrame] = useState(0);

  const origin = route?.origin ?? null;
  const destination = route?.destination ?? null;
  const transportType = route?.transportType ?? null;
  const originLabel = route?.originLabel ?? "";
  const destinationLabel = route?.destinationLabel ?? "";

  const originReal = isRealPlace(origin);
  const destinationReal = isRealPlace(destination);
  const showRoute = originReal && destinationReal && transportType !== null;

  const startLat = origin?.latitude ?? 0;
  const startLng = origin?.longitude ?? 0;
  const endLat = destination?.latitude ?? 0;
  const endLng = destination?.longitude ?? 0;

  // Высоту дуги масштабируем по длине маршрута, иначе у близких городов при зуме дуга
  // станет вертикальным шпилем.
  const separation = originReal && destinationReal ? centralAngleRad(startLat, startLng, endLat, endLng) : 0;
  const apex = (transportType ? TRANSPORT_VISUAL[transportType].altitude : 0) * apexScale(separation);

  // Подпись каждого пина — на сторону, противоположную второму концу. Восточнее ≈ правее на экране.
  const originSide: LabelSide = endLng > startLng ? "left" : "right";
  const destinationSide: LabelSide = startLng > endLng ? "left" : "right";

  // Стабильная identity в пределах координат/подписи: смена ввода пересоберёт DOM с новым
  // текстом, внутри анимации DOM переиспользуется.
  const pins = useMemo<RouteHtmlDatum[]>(() => {
    const result: RouteHtmlDatum[] = [];
    if (originReal) {
      result.push({
        kind: "route-pin",
        lat: startLat,
        lng: startLng,
        alt: PIN_ALTITUDE,
        name: originLabel,
        side: originSide,
      });
    }

    if (destinationReal) {
      result.push({
        kind: "route-pin",
        lat: endLat,
        lng: endLng,
        alt: PIN_ALTITUDE,
        name: destinationLabel,
        side: destinationSide,
      });
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

  // Identity транспорта завязана на иконку (смена среды → новый DOM). Координаты — изменяемые
  // поля, их покадрово мутирует rAF.
  const vehicle = useMemo<RouteHtmlDatum>(
    () => ({
      kind: "route-vehicle",
      lat: 0,
      lng: 0,
      alt: 0,
      icon: transportType ? TRANSPORT_VISUAL[transportType].icon : "",
    }),
    [transportType],
  );

  useEffect(() => {
    if (!showRoute || !transportType) {
      progressRef.current = 0;
      return;
    }

    const config = TRANSPORT_VISUAL[transportType];

    const orientIcon = (t: number) => {
      const globe = globeRef.current;
      const iconEl = containerRef.current?.querySelector<HTMLElement>(`.${VEHICLE_ICON_CLASS}`);
      if (!globe || !iconEl) return;

      const aheadT = t < 1 ? Math.min(1, t + HEADING_LOOKAHEAD) : t - HEADING_LOOKAHEAD;
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
        // Top-down (самолёт): крутим на полный экранный курс.
        iconEl.style.transform = `rotate(${Math.atan2(dy, dx) * RAD + ICON_ROTATION_OFFSET_DEG}deg)`;
      } else {
        // Вид сбоку (машина/корабль): держим вертикально, только зеркалим по ходу движения —
        // иначе при движении в обратную сторону перевернётся вверх ногами.
        const facesRight = dx >= 0;
        iconEl.style.transform = `scaleX(${facesRight === config.nativeFacesRight ? 1 : -1})`;
      }
    };

    const place = (t: number) => {
      const point = greatCirclePoint(startLat, startLng, endLat, endLng, t);
      // Мутация намеренная: three-globe диффит htmlElementsData по identity объекта и
      // переиспользует DOM, только если ссылка стабильна. Новый объект на каждый кадр
      // пересобирал бы DOM-иконку 60 раз в секунду вместо обновления её позиции.
      /* oxlint-disable react/immutability -- см. комментарий выше */
      vehicle.lat = point.lat;
      vehicle.lng = point.lng;
      vehicle.alt = arcAltitude(t, apex);
      /* oxlint-enable react/immutability */
      progressRef.current = t;
      orientIcon(t);
    };

    if (reducedMotion) {
      place(1);
      // `place` мутирует `vehicle`/`progressRef` мимо React — подхватить конечную позицию в
      // данных слоёв можно только форсированным ре-рендером.
      // oxlint-disable-next-line react/set-state-in-effect -- намеренный форс ре-рендера после внешней мутации, см. выше
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
  }, [
    showRoute,
    transportType,
    vehicle,
    apex,
    startLat,
    startLng,
    endLat,
    endLng,
    reducedMotion,
    globeRef,
    containerRef,
  ]);

  // Альфу следа ведёт свой rAF, а в данные слоя её подхватывает покадровый ре-рендер цикла
  // движения выше (он крутится, пока маршрут показан).
  useEffect(() => {
    if (!fading) {
      trailAlphaRef.current = 1;
      return;
    }

    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (startTs === 0) startTs = ts;
      trailAlphaRef.current = Math.max(0, 1 - (ts - startTs) / ROUTE_FADE_MS);
      if (trailAlphaRef.current > 0) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fading]);

  if (!originReal && !destinationReal) {
    return { htmlData: NO_ROUTE_HTML, trails: NO_TRAILS };
  }

  if (!showRoute) {
    return { htmlData: pins, trails: NO_TRAILS };
  }

  // progressRef пишется только внутри rAF-колбэка, а этот рендер форсирует тот же колбэк через
  // setFrame — к моменту чтения значение уже устоялось.
  /* oxlint-disable react/refs -- намеренное чтение вне эффекта, см. комментарий выше */
  const trails = [
    {
      coords: buildTrail(startLat, startLng, endLat, endLng, apex, progressRef.current),
      color: `rgba(${TRAIL_RGB}, ${trailAlphaRef.current})`,
    },
  ];
  /* oxlint-enable react/refs */
  return { htmlData: [...pins, vehicle], trails };
}
