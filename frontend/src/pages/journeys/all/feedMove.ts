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
