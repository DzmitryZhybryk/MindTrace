import {
  listJourneysInfiniteOptions,
  zTransportType,
  type JourneyFeedEntry,
  type JourneysFeedResponse,
  type ListJourneysData,
  type TransportType,
} from "../../../api/sdk";
import type { YearRange } from "./yearRange";

interface FeedFilters {
  yearRange: YearRange | null;
  transportTypes: readonly TransportType[];
}

/** Поездки одного года в порядке ленты. */
export interface FeedYearGroup {
  year: number;
  journeys: readonly JourneyFeedEntry[];
}

/**
 * Опции бесконечного запроса ленты — единственное место, где фильтры превращаются в ключ.
 *
 * Одинаковый набор транспорта даёт одинаковый ключ при любом порядке выбора, а «выбраны все»
 * равносильно «без фильтра». Первая порция — без курсора: пустой объект, а не `null` —
 * сгенерированный `queryFn` принимает объект за параметры запроса. Ответ не устаревает сам —
 * его сбрасывают изменения поездок.
 */
export function feedQueryOptions({ yearRange, transportTypes }: FeedFilters) {
  const query: NonNullable<ListJourneysData["query"]> = {};
  if (yearRange) {
    [query.yearFrom, query.yearTo] = yearRange;
  }

  if (transportTypes.length < zTransportType.options.length) {
    query.transportType = [...transportTypes].sort();
  }

  return {
    ...listJourneysInfiniteOptions({ query }),
    initialPageParam: {},
    getNextPageParam: (lastPage: JourneysFeedResponse) => lastPage.nextCursor ?? undefined,
    staleTime: Infinity,
  };
}

/**
 * Раскладывает загруженные порции ленты по годам.
 *
 * Поездка, попавшая в две порции (строки сдвинулись между запросами), показывается один раз —
 * там, где встретилась первой. Годы идут в порядке первого появления, то есть как в ленте.
 *
 * Args:
 *     pages: Загруженные порции в порядке загрузки.
 *
 * Returns:
 *     Группы по годам.
 */
export function groupFeedByYear(pages: readonly JourneysFeedResponse[]): readonly FeedYearGroup[] {
  const seen = new Set<string>();
  const groups = new Map<number, JourneyFeedEntry[]>();
  for (const journey of pages.flatMap((page) => page.items)) {
    if (seen.has(journey.journeyId)) {
      continue;
    }

    seen.add(journey.journeyId);
    const group = groups.get(journey.traveledYear);
    if (group) {
      group.push(journey);
    } else {
      groups.set(journey.traveledYear, [journey]);
    }
  }

  return [...groups].map(([year, journeys]) => ({ year, journeys }));
}
