import type { PlaceResponse } from "../../api/sdk";

/*
 * Чистая геометрия маршрута для JourneyGlobe: great-circle интерполяция, высота дуги,
 * авто-зум камеры под длину маршрута, сэмплирование следа. Вынесено из компонента,
 * чтобы математику (ядро визуализации поездки) можно было покрыть unit-тестами —
 * сам three/WebGL-рендер в jsdom не тестируется, а эти функции детерминированы.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

// Камера: авто-зум по близости городов. Чем ближе города, тем сильнее зум (меньше altitude),
// чтобы маршрут занимал ~ROUTE_VIEWPORT_SPAN долю обзора, в пределах [MIN, MAX].
const CAMERA_FOV_DEG = 50; // поле зрения камеры three.js в globe.gl
const ROUTE_VIEWPORT_SPAN = 0.1; // целевая доля обзора под маршрут (больше → ближе зум)
export const CAMERA_MAX_ALTITUDE = 1.7; // дальний предел (города далеко / выбран один)
export const CAMERA_MIN_ALTITUDE = 0.12; // ближний предел (ближе города не приближаем)
// Высота дуги нормируется на этот угловой размер: у дальних маршрутов дуга «полная»,
// у близких масштабируется вниз, иначе при зуме превратится в вертикальный шпиль.
const ARC_REFERENCE_SEPARATION_RAD = (50 * Math.PI) / 180;
const TRAIL_SAMPLES = 96;

export type GeoPoint = { lat: number; lng: number };
export type TrailPoint = { lat: number; lng: number; alt: number };

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
export function isRealPlace(place: PlaceResponse | null): place is PlaceResponse {
  return place !== null && (place.latitude !== 0 || place.longitude !== 0);
}
