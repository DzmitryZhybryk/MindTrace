/**
 * Куда пользователь перетащил карточку фильтров карты перемещений — живёт в localStorage и
 * переживает перезагрузку и уход со вкладки. Нет сохранённого — карточка в левом нижнем углу.
 */

/** Положение карточки от левого верхнего угла области карты, px. */
export interface CardPosition {
  left: number;
  top: number;
}

const CONTROLS_POSITION_KEY = "journeys-movements-controls-position";

function isCardPosition(value: unknown): value is CardPosition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const { left, top } = value as Record<string, unknown>;
  return typeof left === "number" && Number.isFinite(left) && typeof top === "number" && Number.isFinite(top);
}

/** Сохранённое положение карточки; `null` — не сохранено или испорчено. */
export function readControlsPosition(): CardPosition | null {
  try {
    const stored = localStorage.getItem(CONTROLS_POSITION_KEY);
    const parsed: unknown = stored === null ? null : JSON.parse(stored);
    return isCardPosition(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Сохраняет положение карточки; `null` — забыть, карточка вернётся в угол по умолчанию. */
export function saveControlsPosition(position: CardPosition | null): void {
  try {
    if (position) {
      localStorage.setItem(CONTROLS_POSITION_KEY, JSON.stringify(position));
    } else {
      localStorage.removeItem(CONTROLS_POSITION_KEY);
    }
  } catch {
    // localStorage недоступен (приватный режим / отключён) — положение не сохраняем.
  }
}
