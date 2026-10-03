import type { SortingStrategy } from "@dnd-kit/sortable";

import type { JourneyFeedEntry, JourneysFeedResponse, MovePlacement } from "../../../api/sdk";

/** Куда переносится поездка: рядом с соседом, до или после него, и в его год. */
export interface MoveTarget {
  neighborJourneyId: string;
  placement: MovePlacement;
  traveledYear: number;
}

/**
 * Переводит «строку бросили на место другой» в запрос переноса.
 *
 * Тянули вниз — поездка встаёт после той, на которую бросили; вверх — перед ней. Год берётся
 * у соседа. Поэтому в конец года строку приносят сверху, а в начало года — снизу.
 *
 * Args:
 *     journeys: Строки ленты в порядке показа.
 *     activeId: Перетаскиваемая поездка.
 *     overId: Поездка, на место которой бросили.
 *
 * Returns:
 *     Цель переноса или `null`, если строка осталась на месте.
 */
export function resolveMoveTarget(
  journeys: readonly JourneyFeedEntry[],
  activeId: string,
  overId: string,
): MoveTarget | null {
  const from = journeys.findIndex((journey) => journey.journeyId === activeId);
  const to = journeys.findIndex((journey) => journey.journeyId === overId);
  if (from === -1 || to === -1 || from === to) {
    return null;
  }

  const neighbor = journeys[to];
  return {
    neighborJourneyId: neighbor.journeyId,
    placement: to > from ? "after" : "before",
    traveledYear: neighbor.traveledYear,
  };
}

/**
 * Сдвиг строк ленты, пока строку несут: строки между её местом и целью уступают ей ровно её
 * высоту. Строки в году идут вплотную, а стандартная стратегия dnd-kit прибавляет к высоте
 * расстояние до соседней строки — на границе лет в него входит заголовок, и строка визуально
 * уезжала в чужой год. Заголовки сдвигает `yearHeaderShift` на ту же высоту.
 */
export const feedSortingStrategy: SortingStrategy = ({ activeIndex, activeNodeRect, index, rects, overIndex }) => {
  const height = (rects[activeIndex] ?? activeNodeRect)?.height;
  if (height === undefined || index === activeIndex) {
    return null;
  }

  let y = 0;
  if (index > activeIndex && index <= overIndex) {
    y = -height;
  } else if (index < activeIndex && index >= overIndex) {
    y = height;
  }

  return y === 0 ? null : { x: 0, y, scaleX: 1, scaleY: 1 };
};

/**
 * Сдвиг заголовка года, пока строку несут, — в пару к `feedSortingStrategy`.
 *
 * Заголовок стоит перед первой строкой своего года. Если он оказался между местом строки и
 * целью, он уступает строке её высоту вместе со строками: тогда на экране видно, в какой год
 * строка встанет, а строки под целью остаются в своём году.
 *
 * Args:
 *     activeIndex: Место перетаскиваемой строки в ленте.
 *     overIndex: Место строки, над которой её держат.
 *     firstRowIndex: Место первой строки года этого заголовка.
 *     height: Высота перетаскиваемой строки, px.
 *
 * Returns:
 *     Сдвиг по вертикали, px.
 */
export function yearHeaderShift({
  activeIndex,
  overIndex,
  firstRowIndex,
  height,
}: {
  activeIndex: number;
  overIndex: number;
  firstRowIndex: number;
  height: number;
}): number {
  if (activeIndex === -1 || overIndex === -1) {
    return 0;
  }

  if (activeIndex < firstRowIndex && firstRowIndex <= overIndex) {
    return -height;
  }

  if (overIndex < firstRowIndex && firstRowIndex <= activeIndex) {
    return height;
  }

  return 0;
}

/**
 * Переставляет поездку в загруженных порциях ленты — так же, как это сделает бэк.
 *
 * Поездка встаёт рядом с соседом в его порции и получает его год. Если соседа или поездки в
 * порциях нет, порции возвращаются как были.
 *
 * Args:
 *     pages: Порции ленты.
 *     journeyId: Переносимая поездка.
 *     target: Цель переноса.
 *
 * Returns:
 *     Новые порции.
 */
export function moveJourneyInPages(
  pages: readonly JourneysFeedResponse[],
  journeyId: string,
  target: MoveTarget,
): JourneysFeedResponse[] {
  const moved = pages.flatMap((page) => page.items).find((journey) => journey.journeyId === journeyId);
  const hasNeighbor = pages.some((page) => page.items.some((journey) => journey.journeyId === target.neighborJourneyId));
  if (!moved || !hasNeighbor) {
    return [...pages];
  }

  const placed: JourneyFeedEntry = { ...moved, traveledYear: target.traveledYear };
  return pages.map((page) => {
    const items = page.items.filter((journey) => journey.journeyId !== journeyId);
    const neighborIndex = items.findIndex((journey) => journey.journeyId === target.neighborJourneyId);
    if (neighborIndex === -1) {
      return { ...page, items };
    }

    const insertAt = target.placement === "after" ? neighborIndex + 1 : neighborIndex;
    return { ...page, items: [...items.slice(0, insertAt), placed, ...items.slice(insertAt)] };
  });
}
