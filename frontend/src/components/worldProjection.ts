import { clamp } from "./globe/route";

/*
 * Проекция плоской карты мира: географические координаты → координаты SVG-холста,
 * и видимая область холста (масштаб и сдвиг карты). Общая для всех плоских карт, чтобы
 * страны и то, что рисуется поверх них, совпадали.
 */

// --- Проекция Equal Earth (Šavrič, Patterson, Jenny, 2018) ----------------
// Равноплощадная: честно показывает «сколько объехал», без раздувания полюсов.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const DEG2RAD = Math.PI / 180;

function project(lng: number, lat: number): [number, number] {
  const lambda = lng * DEG2RAD;
  const phi = lat * DEG2RAD;
  const theta = Math.asin(M * Math.sin(phi));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const x =
    (2 * Math.sqrt(3) * lambda * Math.cos(theta)) /
    (3 * (A1 + 3 * A2 * t2 + 7 * A3 * t6 + 9 * A4 * t6 * t2));
  const y = theta * (A1 + A2 * t2 + A3 * t6 + A4 * t6 * t2);
  return [x, y];
}

// Габариты холста выводим из реальных границ проекции, а не подбираем на глаз.
const VIEW_WIDTH = 1000;
const X_MAX = project(180, 0)[0];
const Y_MAX = project(0, 90)[1];
const VIEW_HEIGHT = Math.round((VIEW_WIDTH * Y_MAX) / X_MAX);

/**
 * Если соседние точки линии «перепрыгивают» антимеридиан (Россия, Фиджи, перелёт через
 * Тихий океан), путь нужно рвать, иначе через всю карту тянется горизонтальная полоса.
 */
export const ANTIMERIDIAN_JUMP = 180;

/** Видимая область холста в его координатах. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Весь мир целиком. */
export const WORLD_VIEW_BOX: ViewBox = { x: 0, y: 0, width: VIEW_WIDTH, height: VIEW_HEIGHT };

/** Пропорции мира: видимая область всегда в них — карта вписана по высоте и обрезает ширину. */
export const WORLD_ASPECT = VIEW_WIDTH / VIEW_HEIGHT;

// Сильнее всего карта приближается в восемь раз.
const MAX_ZOOM = 8;
const MIN_VIEW_WIDTH = VIEW_WIDTH / MAX_ZOOM;

/** Видна ли вся карта (не приближена). */
export function isWorldView(view: ViewBox): boolean {
  return view.width >= VIEW_WIDTH;
}

/** Приводит область к допустимой: пропорции мира, масштаб от «весь мир» до ×8, не за краем мира. */
export function clampView(view: ViewBox): ViewBox {
  // Высота мира округлена до целого, и width / WORLD_ASPECT дала бы 487.00000000000006 —
  // весь мир возвращаем точной константой, а не пересчётом.
  if (view.width >= VIEW_WIDTH) {
    return WORLD_VIEW_BOX;
  }

  const width = Math.max(view.width, MIN_VIEW_WIDTH);
  const height = width / WORLD_ASPECT;
  return {
    x: clamp(view.x, 0, VIEW_WIDTH - width),
    y: clamp(view.y, 0, VIEW_HEIGHT - height),
    width,
    height,
  };
}

/**
 * Приближает область в `factor` раз (меньше единицы — отдаляет). Точка холста
 * `(anchorX, anchorY)` остаётся на месте экрана — карта масштабируется вокруг курсора.
 */
export function zoomView(view: ViewBox, factor: number, anchorX: number, anchorY: number): ViewBox {
  const width = clamp(view.width / factor, MIN_VIEW_WIDTH, VIEW_WIDTH);
  const ratio = width / view.width;
  return clampView({
    x: anchorX - (anchorX - view.x) * ratio,
    y: anchorY - (anchorY - view.y) * ratio,
    width,
    height: width / WORLD_ASPECT,
  });
}

/** Сдвигает область на `(dx, dy)` единиц холста. */
export function panView(view: ViewBox, dx: number, dy: number): ViewBox {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy });
}

/** Переводит долготу и широту в координаты холста (x вправо, y вниз). */
export function projectToScreen(lng: number, lat: number): [number, number] {
  const [x, y] = project(lng, lat);
  return [((x + X_MAX) / (2 * X_MAX)) * VIEW_WIDTH, ((Y_MAX - y) / (2 * Y_MAX)) * VIEW_HEIGHT];
}
