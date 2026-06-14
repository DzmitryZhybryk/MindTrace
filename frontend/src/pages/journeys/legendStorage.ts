/**
 * Флаг «легенда карты свёрнута» живёт в localStorage — выбор запоминается между
 * сессиями и заходами на страницу: один раз свернул — дальше карта открывается
 * со свёрнутой легендой (подсказки по цветам пользователю уже не нужны).
 */

const LEGEND_COLLAPSED_KEY = "journeys-legend-collapsed";

/** Проверяет, свёрнута ли легенда по сохранённому выбору пользователя. */
export function isLegendCollapsed(): boolean {
  try {
    return localStorage.getItem(LEGEND_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Сохраняет состояние свёрнутости легенды (свёрнута → пишем, развёрнута → чистим). */
export function setLegendCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(LEGEND_COLLAPSED_KEY, "1");
    } else {
      localStorage.removeItem(LEGEND_COLLAPSED_KEY);
    }
  } catch {
    // localStorage недоступен (приватный режим / отключён) — состояние не сохраняем.
  }
}
