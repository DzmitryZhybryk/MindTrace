/*
 * Деклаттер подписей глобуса: решает, чьим подписям хватает места, в чистых экранных
 * координатах — без DOM и без знания о globe.gl (интеграция собирает rect'ы и применяет
 * результат сама, см. GlobeCanvas).
 *
 * Правила:
 *  - приоритет у метки ближе к центру диска: у лимба проекция сжимает расстояния, и текст
 *    там всё равно нечитаем — уступает он; tie-break по имени, чтобы порядок был стабилен;
 *  - гистерезис: спрятанная подпись возвращается только с запасом зазора (SHOW_CLEARANCE_PX),
 *    иначе на границе пересечения она мерцала бы каждый кадр вращения.
 */

/** Экранный прямоугольник подписи; `name` — стабильный ключ метки (имя города). */
export interface LabelBox {
  readonly name: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Центр диска глобуса в тех же экранных координатах, что и `LabelBox`. */
export interface DiskCenter {
  readonly x: number;
  readonly y: number;
}

/** Запас зазора (px), с которым спрятанная подпись возвращается — гистерезис против мерцания. */
export const SHOW_CLEARANCE_PX = 8;

/** Квадрат расстояния от центра прямоугольника подписи до центра диска. */
function distanceSqToCenter(box: LabelBox, center: DiskCenter): number {
  const dx = box.left + box.width / 2 - center.x;
  const dy = box.top + box.height / 2 - center.y;
  return dx * dx + dy * dy;
}

/** Пересекаются ли прямоугольники, если раздуть их на `gap` px с каждой стороны. */
function boxesIntersect(a: LabelBox, b: LabelBox, gap: number): boolean {
  return (
    a.left < b.left + b.width + gap &&
    b.left < a.left + a.width + gap &&
    a.top < b.top + b.height + gap &&
    b.top < a.top + a.height + gap
  );
}

/**
 * Ищет конфликт кандидата с уже принятыми подписями.
 *
 * Линейный проход — единственное место, которое надо заменить пространственной сеткой,
 * когда городов станут сотни; сигнатура при этом не меняется.
 *
 * Args:
 *     box: Кандидат на показ.
 *     accepted: Подписи, уже получившие место (в порядке приоритета).
 *     gap: Требуемый зазор в px (0 — достаточно не пересекаться).
 *
 * Returns:
 *     Есть ли пересечение хотя бы с одной принятой подписью.
 */
function hasConflict(box: LabelBox, accepted: readonly LabelBox[], gap: number): boolean {
  return accepted.some((other) => boxesIntersect(box, other, gap));
}

/**
 * Решает, какие подписи спрятать в текущем кадре.
 *
 * Жадный отбор в порядке приоритета (ближе к центру диска — раньше; при равенстве — по
 * имени): подпись получает место, если не конфликтует с уже принятыми. Прятавшаяся в
 * прошлом кадре подпись требует зазор `SHOW_CLEARANCE_PX`, видимая — лишь отсутствия
 * пересечения. Прямоугольники нулевого размера (метка ещё не отрендерена) вызывающая
 * сторона отфильтровывает сама.
 *
 * Args:
 *     boxes: Экранные прямоугольники всех видимых подписей.
 *     center: Центр диска глобуса в тех же координатах.
 *     previouslyHidden: Имена подписей, спрятанных прошлым прогоном (гистерезис).
 *
 * Returns:
 *     Имена подписей, которые надо спрятать в этом кадре.
 */
export function resolveLabelVisibility(
  boxes: readonly LabelBox[],
  center: DiskCenter,
  previouslyHidden: ReadonlySet<string>,
): Set<string> {
  const byPriority = boxes
    .map((box) => ({ box, distanceSq: distanceSqToCenter(box, center) }))
    .sort((a, b) => a.distanceSq - b.distanceSq || (a.box.name < b.box.name ? -1 : 1))
    .map((entry) => entry.box);

  const accepted: LabelBox[] = [];
  const hidden = new Set<string>();
  for (const box of byPriority) {
    const requiredGap = previouslyHidden.has(box.name) ? SHOW_CLEARANCE_PX : 0;
    if (hasConflict(box, accepted, requiredGap)) {
      hidden.add(box.name);
    } else {
      accepted.push(box);
    }
  }

  return hidden;
}
