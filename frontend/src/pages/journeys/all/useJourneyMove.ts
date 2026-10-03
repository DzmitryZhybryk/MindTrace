import { useMutation, useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, errorCodeToken } from "../../../api/errors";
import { moveJourneyMutation, type JourneyFeedEntry, type JourneysFeedResponse } from "../../../api/sdk";
import { invalidateJourneyAggregates, invalidateJourneyFeed } from "../journeyCache";
import { moveJourneyInPages, type MoveTarget } from "./feedMove";

/**
 * Перенос поездки с оптимистичной перестановкой в ленте.
 *
 * Строка встаёт на новое место сразу, до ответа. Сервер ставит её вплотную к соседу, поэтому
 * показанная лента после успеха уже верна и не перезапрашивается; сбрасываются только скрытые
 * варианты ленты (другие фильтры). Бэк отказал (сосед удалён, чужой) — лента возвращается как
 * была, показывается ошибка и перезапрашивается: отказ значит, что она разошлась с сервером.
 * Карты и годы сбрасываются, только если сменился год: порядок внутри года на них не влияет.
 *
 * Args:
 *     feedKey: Ключ показанной ленты — её и переставляем.
 *
 * Returns:
 *     `move`, флаг идущего переноса и токен ошибки последнего переноса.
 */
export function useJourneyMove(feedKey: QueryKey) {
  const queryClient = useQueryClient();
  const [errorToken, setErrorToken] = useState<string | null>(null);
  const { mutateAsync, isPending } = useMutation(moveJourneyMutation());

  const move = async (journey: JourneyFeedEntry, target: MoveTarget) => {
    setErrorToken(null);
    // Запрос ленты, вернувшийся после перестановки, затёр бы её старым порядком.
    await queryClient.cancelQueries({ queryKey: feedKey });
    const previous = queryClient.getQueryData<InfiniteData<JourneysFeedResponse>>(feedKey);
    queryClient.setQueryData<InfiniteData<JourneysFeedResponse>>(
      feedKey,
      (data) => data && { ...data, pages: moveJourneyInPages(data.pages, journey.journeyId, target) },
    );

    try {
      const result = await mutateAsync({
        path: { journey_id: journey.journeyId },
        body: { neighborJourneyId: target.neighborJourneyId, placement: target.placement },
      });
      if (result.traveledYear !== journey.traveledYear) {
        void invalidateJourneyAggregates(queryClient);
      }

      void invalidateJourneyFeed(queryClient, "inactive");
    } catch (err) {
      queryClient.setQueryData(feedKey, previous);
      setErrorToken(errorCodeToken(err instanceof ApiError ? err.code : "network"));
      void invalidateJourneyFeed(queryClient);
    }
  };

  return { move, isMoving: isPending, errorToken };
}
