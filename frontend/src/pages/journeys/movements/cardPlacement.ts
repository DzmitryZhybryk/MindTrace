import type { CardPosition } from "./controlsPosition";

/** Прямоугольник в координатах области карты, px. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PlacementLayout {
  /** Размер области карты. */
  area: { width: number; height: number };
  /** Размер карточки (без ушка). */
  card: { width: number; height: number };
  /** Сколько ушко торчит над карточкой. */
  overhangTop: number;
  /** Панель навигации поверх карты; `null` — её нет поверх (мобильная раскладка). */
  panel: Box | null;
}

// Отступ от краёв области карты, когда панели нет — тот же, что у панели слева.
const EDGE_GAP = 32;
// Зазор между карточкой и панелью, если карточка встала рядом с ней.
const PANEL_GAP = 16;

function overlaps(first: Box, second: Box): boolean {
  return (
    first.left < second.left + second.width &&
    second.left < first.left + first.width &&
    first.top < second.top + second.height &&
    second.top < first.top + first.height
  );
}

/**
 * Где встать карточке фильтров, если её хотят поставить в `wanted`.
 *
 * Рамка, внутри которой ездит карточка, выровнена по панели навигации: левый край карточки —
 * не левее левого края панели, верх (с ушком) — не выше верха панели; справа и снизу — тот же
 * отступ от края области карты, что у панели слева. На саму панель карточка не наезжает: если
 * её тянут туда, она встаёт рядом — правее панели или под ней, смотря что ближе.
 */
export function placeCard(wanted: CardPosition, { area, card, overhangTop, panel }: PlacementLayout): CardPosition {
  const edge = panel ? panel.left : EDGE_GAP;
  const minLeft = edge;
  const maxLeft = Math.max(area.width - edge - card.width, minLeft);
  const minTop = (panel ? panel.top : EDGE_GAP) + overhangTop;
  const maxTop = Math.max(area.height - edge - card.height, minTop);
  const clampIntoFrame = (position: CardPosition): CardPosition => ({
    left: Math.min(Math.max(position.left, minLeft), maxLeft),
    top: Math.min(Math.max(position.top, minTop), maxTop),
  });

  const placed = clampIntoFrame(wanted);
  const footprint = (position: CardPosition): Box => ({
    left: position.left,
    top: position.top - overhangTop,
    width: card.width,
    height: card.height + overhangTop,
  });
  if (!panel || !overlaps(footprint(placed), panel)) {
    return placed;
  }

  // Наехала на панель — ближайшее из двух мест рядом с ней, которое помещается в рамку.
  const besidePanel = [
    { left: panel.left + panel.width + PANEL_GAP, top: placed.top },
    { left: placed.left, top: panel.top + panel.height + PANEL_GAP + overhangTop },
  ]
    .map(clampIntoFrame)
    .filter((position) => !overlaps(footprint(position), panel));
  const distance = (position: CardPosition) => Math.hypot(position.left - placed.left, position.top - placed.top);
  return besidePanel.sort((first, second) => distance(first) - distance(second))[0] ?? placed;
}
