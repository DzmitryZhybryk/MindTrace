import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import {
  getJourneysGlobeQueryKey,
  getJourneysMapQueryKey,
  getJourneyYearsQueryKey,
  getMovementsMapQueryKey,
  listJourneysInfiniteQueryKey,
  type JourneysFeedResponse,
} from "../../api/sdk";

/*
 * Ключи без параметров совпадают с ключами для любых фильтров — сбрасываются все варианты карты
 * перемещений и ленты. Всё это живёт с `staleTime: Infinity`, поэтому без явного сброса
 * изменённая поездка не появилась бы до перезагрузки страницы.
 */

/** Сбрасывает всё, что строится по поездкам, кроме ленты: карты, глобус, годы. */
export function invalidateJourneyAggregates(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: getJourneysMapQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getJourneysGlobeQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getMovementsMapQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getJourneyYearsQueryKey() }),
  ]);
}

/**
 * Сбрасывает все загруженные варианты ленты.
 *
 * Args:
 *     queryClient: Клиент запросов.
 *     refetchType: Какие варианты перезапросить сразу: `"active"` — показанную ленту тоже,
 *         `"inactive"` — только скрытые, показанная остаётся как есть до следующего обновления.
 */
export function invalidateJourneyFeed(
  queryClient: QueryClient,
  refetchType: "active" | "inactive" = "active",
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: listJourneysInfiniteQueryKey(), refetchType });
}

/**
 * Убирает поездку из всех загруженных вариантов ленты без запроса.
 *
 * Курсоры следующих порций остаются верными: они указывают на последнюю строку своей порции, а не
 * на номер позиции.
 */
export function removeJourneyFromFeed(queryClient: QueryClient, journeyId: string): void {
  queryClient.setQueriesData<InfiniteData<JourneysFeedResponse>>(
    { queryKey: listJourneysInfiniteQueryKey() },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.filter((journey) => journey.journeyId !== journeyId),
        })),
      },
  );
}
