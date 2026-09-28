import type { GlobePov } from "./GlobeCanvas";

/*
 * Подлёт камеры при появлении глобуса: камера стартует дальше и с экватора, приближается и
 * одновременно поворачивается. Поворот — часть того же движения: его скорость плавно спадает
 * ровно до скорости автовращения, поэтому к концу подлёта вращение переходит к OrbitControls
 * без шва. Штатный перелёт globe.gl (`pointOfView` с длительностью) так не умеет: его tween
 * каждый кадр перезаписывает позицию камеры, и автовращение во время перелёта съедается.
 */

/** Во сколько раз дальше стартует камера (прежний глобус формы: 2.5 → 1.7 ≈ 1.45). */
const REVEAL_DISTANCE_FACTOR = 1.45;
/** На сколько градусов долготы глобус «докручивается» за подлёт сверх автовращения. */
const REVEAL_SPIN_DEG = 30;

/** Кубическое замедление к концу: производная в конце нулевая — скорость сдаётся плавно. */
function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

/**
 * Точка обзора на заданном шаге подлёта.
 *
 * Args:
 *     target: Куда прилетает камера.
 *     progress: Доля подлёта, 0..1 (значения за пределами зажимаются).
 *     spinDegPerSec: Скорость автовращения по долготе в конце подлёта (со знаком), 0 — без него.
 *     durationMs: Длительность подлёта.
 *
 * Returns:
 *     Точка обзора камеры на этом шаге; при `progress = 1` — ровно `target`.
 */
export function revealPov(target: GlobePov, progress: number, spinDegPerSec: number, durationMs: number): GlobePov {
  const t = Math.min(Math.max(progress, 0), 1);
  const eased = easeOutCubic(t);
  const startAltitude = target.altitude * REVEAL_DISTANCE_FACTOR;
  const remainingSeconds = ((1 - t) * durationMs) / 1000;
  // Докрутка идёт в сторону автовращения (или, без него, в ту же сторону, что оно шло бы).
  const spinDirection = spinDegPerSec > 0 ? 1 : -1;

  return {
    lat: target.lat * eased,
    lng: target.lng - spinDegPerSec * remainingSeconds - spinDirection * REVEAL_SPIN_DEG * (1 - t) ** 3,
    altitude: startAltitude + (target.altitude - startAltitude) * eased,
  };
}
