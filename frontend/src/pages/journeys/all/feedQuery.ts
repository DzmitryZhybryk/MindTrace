import {
  listJourneysInfiniteOptions,
  zTransportType,
  type JourneyFeedEntry,
  type JourneysFeedResponse,
  type ListJourneysData,
  type TransportType,
} from "../../../api/sdk";
import type { YearRange } from "./yearRange";

export interface FeedFilters {
  yearRange: YearRange | null;
  transportTypes: readonly TransportType[];
}

/** Фильтры, при которых лента — все поездки: её кэш — источник для выборки на клиенте. */
export const NO_FEED_FILTERS: FeedFilters = { yearRange: null, transportTypes: zTransportType.options };

// Ползунок лет меняет фильтр на каждом пройденном годе. Лента по фильтру уходит в сеть, когда он
// столько простоял: запрос сменившегося фильтра отменяется ещё до отправки.
const FILTER_SETTLE_MS = 250;

/** Ждёт, пока фильтр постоит; отмена запроса прерывает ожидание. */
function waitForFilterToSettle(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, FILTER_SETTLE_MS);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
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
 *
 * Первая порция ленты по фильтру ждёт, пока фильтр постоит: если за это время его сменили, запрос
 * отменяется — Query отменяет запрос, который никто больше не ждёт, раз `queryFn` взял сигнал.
 */
export function feedQueryOptions({ yearRange, transportTypes }: FeedFilters) {
  const query: NonNullable<ListJourneysData["query"]> = {};
  if (yearRange) {
    [query.yearFrom, query.yearTo] = yearRange;
  }

  if (transportTypes.length < zTransportType.options.length) {
    query.transportType = [...transportTypes].sort();
  }

  const options = {
    ...listJourneysInfiniteOptions({ query }),
    initialPageParam: {},
    getNextPageParam: (lastPage: JourneysFeedResponse) => lastPage.nextCursor ?? undefined,
    staleTime: Infinity,
  };
  const fetchPage = options.queryFn;
  if (Object.keys(query).length === 0 || typeof fetchPage !== "function") {
    return options;
  }

  return {
    ...options,
    queryFn: async (context: Parameters<typeof fetchPage>[0]) => {
      // Первая порция — объект параметров, следующие — строка курсора.
      if (typeof context.pageParam === "object") {
        await waitForFilterToSettle(context.signal);
      }

      return fetchPage(context);
    },
  };
}

/**
 * Лента по фильтрам, собранная на клиенте из уже загруженных порций, — её видно, пока не пришёл
 * ответ сервера.
 *
 * Порядок строк тот же, что отдаст сервер: фильтр только выкидывает строки. Курсоров у выборки
 * нет — догружать её нечем, она живёт до ответа.
 *
 * Args:
 *     pages: Загруженные порции.
 *     filters: Фильтры ленты.
 *
 * Returns:
 *     Порции только со строками, подходящими под фильтры.
 */
export function filterFeedPages(
  pages: readonly JourneysFeedResponse[],
  { yearRange, transportTypes }: FeedFilters,
): JourneysFeedResponse[] {
  const isShown = (journey: JourneyFeedEntry) =>
    transportTypes.includes(journey.transportType) &&
    (!yearRange || (journey.traveledYear >= yearRange[0] && journey.traveledYear <= yearRange[1]));

  return pages.map((page) => ({ items: page.items.filter(isShown), nextCursor: null }));
}

/**
 * Загружена ли лента до конца: тогда выборка из неё на клиенте совпадает с ответом сервера.
 *
 * Args:
 *     pages: Загруженные порции; `undefined` — ленты в кэше нет.
 *
 * Returns:
 *     `true`, если порций больше нет.
 */
export function isFeedFullyLoaded(pages: readonly JourneysFeedResponse[] | undefined): boolean {
  const lastPage = pages?.at(-1);
  return lastPage !== undefined && !lastPage.nextCursor;
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
