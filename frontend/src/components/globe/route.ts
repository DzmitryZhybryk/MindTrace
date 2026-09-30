import type { PlaceSearchItem, TransportType } from "../../api/sdk";
import type { GlobePov } from "./GlobeCanvas";
import { centralAngleRad } from "./geo";

/*
 * Чистая геометрия маршрута поездки на глобусе: great-circle интерполяция, высота дуги,
 * авто-зум камеры под длину маршрута, сэмплирование следа. Вынесено из сцены (routeScene.ts),
 * чтобы математику (ядро визуализации поездки) можно было покрыть unit-тестами —
 * сам three/WebGL-рендер в jsdom не тестируется, а эти функции детерминированы.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// Камера: авто-зум по близости городов. Чем ближе города, тем сильнее зум (меньше altitude),
// чтобы маршрут занимал ~ROUTE_VIEWPORT_SPAN долю обзора, в пределах [MIN, MAX].
const CAMERA_FOV_DEG = 50; // поле зрения камеры three.js в globe.gl
const ROUTE_VIEWPORT_SPAN = 0.1; // целевая доля обзора под маршрут (больше → ближе зум)
// Дальний предел (города далеко / выбран один / форма пуста). Он же высота камеры грани
// дашборда: при одинаковом масштабе рамки сфера на форме и на главной одного размера, и
// переход между ними — чистый переезд, без раздувания (см. SCREEN_POV в PersistentGlobeHost).
export const CAMERA_MAX_ALTITUDE = 2.4;
export const CAMERA_MIN_ALTITUDE = 0.12; // ближний предел (ближе города не приближаем)
// Высота дуги нормируется на этот угловой размер: у дальних маршрутов дуга «полная»,
// у близких масштабируется вниз, иначе при зуме превратится в вертикальный шпиль.
const ARC_REFERENCE_SEPARATION_RAD = (50 * Math.PI) / 180;
const TRAIL_SAMPLES = 96;

/**
 * Длительность угасания маршрута при уходе с формы на /home. Та же цифра — в
 * globe-route.css (переход прозрачности пинов/иконки): держать их синхронными.
 * Живёт здесь, а не в routeScene.ts: хост импортирует её напрямую, а value-импорт из
 * сцены утянул бы её DOM-код, CSS и SVG в чанк хоста, который грузится на каждой странице.
 */
export const ROUTE_FADE_MS = 700;

export type GeoPoint = { lat: number; lng: number };
export type TrailPoint = { lat: number; lng: number; alt: number };

/** Маршрут поездки, который форма добавления отдаёт глобусу. */
export interface GlobeRoute {
  origin: PlaceSearchItem | null;
  destination: PlaceSearchItem | null;
  transportType: TransportType | null;
  originLabel: string;
  destinationLabel: string;
}

// Вид камеры, пока ни один город не выбран (нейтральный, без демо-маршрута).
const DEFAULT_ROUTE_VIEW: GeoPoint = { lat: 20, lng: 0 };
// Доля широты, которую дальний зум «отдаёт» экватору: вид парой к форме, а не с полюса.
const FAR_ZOOM_EQUATOR_PULL = 0.4;

/** Точка на большом круге между двумя координатами при параметре t ∈ [0, 1] (slerp). */
export function greatCirclePoint(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  t: number,
): GeoPoint {
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
export function arcAltitude(t: number, apex: number): number {
  return Math.sin(Math.PI * t) * apex;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Высота камеры (globe.gl altitude) под угловой размер маршрута: ближе города → меньше
 * altitude (сильнее зум). Геометрия — камера на расстоянии d от центра видит концы
 * маршрута под углом targetHalfAngle; результат зажат в [MIN, MAX].
 */
export function altitudeForSeparation(separationRad: number): number {
  if (separationRad <= 0) {
    return CAMERA_MAX_ALTITUDE;
  }

  const targetHalfAngle = (ROUTE_VIEWPORT_SPAN * CAMERA_FOV_DEG * DEG) / 2;
  const half = separationRad / 2;
  const cameraDistance = Math.cos(half) + Math.sin(half) / Math.tan(targetHalfAngle);
  return clamp(cameraDistance - 1, CAMERA_MIN_ALTITUDE, CAMERA_MAX_ALTITUDE);
}

/**
 * Множитель высоты дуги по длине маршрута (0..1): у близких городов дуга масштабируется
 * вниз (sqrt — чтобы средние маршруты не были слишком плоскими), у дальних — «полная».
 */
export function apexScale(separationRad: number): number {
  return Math.sqrt(Math.min(1, separationRad / ARC_REFERENCE_SEPARATION_RAD));
}

/** Точки следа маршрута до текущего прогресса (голова фиксируется ровно под иконкой). */
export function buildTrail(
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

/** Место «реальное» (выбрано из автокомплита), если у него есть координаты. */
export function isRealPlace(place: PlaceSearchItem | null): place is PlaceSearchItem {
  return place !== null && (place.latitude !== 0 || place.longitude !== 0);
}

/**
 * Точка обзора камеры под маршрут: середина пути (зум по расстоянию), либо единственный
 * выбранный город, либо нейтральный вид, пока ничего не выбрано.
 *
 * Args:
 *     route: Маршрут формы или `null`, если формы нет.
 *
 * Returns:
 *     Точка обзора для `pointOfView` globe.gl.
 */
export function routeCameraPov(route: GlobeRoute | null): GlobePov {
  const origin = route?.origin ?? null;
  const destination = route?.destination ?? null;

  let target = DEFAULT_ROUTE_VIEW;
  let altitude = CAMERA_MAX_ALTITUDE;
  if (isRealPlace(origin) && isRealPlace(destination)) {
    target = greatCirclePoint(origin.latitude, origin.longitude, destination.latitude, destination.longitude, 0.5);
    altitude = altitudeForSeparation(
      centralAngleRad(origin.latitude, origin.longitude, destination.latitude, destination.longitude),
    );
  } else if (isRealPlace(origin)) {
    target = { lat: origin.latitude, lng: origin.longitude };
  } else if (isRealPlace(destination)) {
    target = { lat: destination.latitude, lng: destination.longitude };
  }

  // На ближнем зуме центрируем ровно на маршруте, иначе зум уведёт города из кадра.
  const zoomT = (altitude - CAMERA_MIN_ALTITUDE) / (CAMERA_MAX_ALTITUDE - CAMERA_MIN_ALTITUDE);
  const latFactor = 1 - FAR_ZOOM_EQUATOR_PULL * zoomT;
  return { lat: target.lat * latFactor, lng: target.lng, altitude };
}
