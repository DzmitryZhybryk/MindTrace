import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Button, Loader, Text } from "@mantine/core";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { resolveErrorToken } from "../../../api/errors";
import { placeLabel, usePlaceNames } from "../../../api/placeNames";
import type { JourneyFeedEntry, JourneysFeedResponse, TransportType } from "../../../api/sdk";
import {
  feedSortingStrategy,
  moveJourneyInPages,
  resolveMoveTarget,
  yearHeaderShift,
  type MoveTarget,
} from "./feedMove";
import { feedQueryOptions, filterFeedPages, groupFeedByYear, isFeedFullyLoaded, NO_FEED_FILTERS } from "./feedQuery";
import { JourneyFeedRow } from "./JourneyFeedRow";
import { JourneyRowEditor, type JourneyEditField } from "./JourneyRowEditor";
import { useFlip } from "./motion";
import { useJourneyMove } from "./useJourneyMove";
import { YearHeader } from "./YearHeader";
import type { YearRange } from "./yearRange";

interface JourneyFeedProps {
  yearRange: YearRange | null;
  transportTypes: readonly TransportType[];
  /** Есть ли у пользователя поездки вообще — отличает «пока пусто» от «фильтр ничего не нашёл». */
  hasJourneys: boolean;
  /** Загруженные строки в порядке показа — по ним карта строит кадр. */
  onJourneysChange: (journeys: readonly JourneyFeedEntry[]) => void;
  /** Поездка, на которой сейчас пользователь: тянет, правит, навёл курсор или фокус. */
  onActiveJourneyChange: (journey: JourneyFeedEntry | null) => void;
}

/**
 * Лента поездок по годам с бесконечной прокруткой, правкой строк и перетаскиванием.
 *
 * Следующая порция грузится, когда до конца загруженного остаётся около полэкрана: невидимый
 * сторож растянут вверх от низа списка. Пока идёт запрос ленты или перенос, сторож молчит —
 * догрузка отменила бы обновление уже загруженного. При смене фильтров прежние строки остаются
 * на экране приглушёнными, пока не придёт новый набор; тянуть их в это время нельзя.
 *
 * Все строки — один список для перетаскивания, поэтому строку можно перенести и в другой год;
 * у края ленты список прокручивается сам, а сторож догружает следующие годы.
 */
export function JourneyFeed({
  yearRange,
  transportTypes,
  hasJourneys,
  onJourneysChange,
  onActiveJourneyChange,
}: JourneyFeedProps) {
  const { t, i18n } = useTranslation("journeys");
  const { t: tCommon } = useTranslation("common");
  const queryClient = useQueryClient();
  const filters = { yearRange, transportTypes };
  const options = feedQueryOptions(filters);
  // Пока сервер не ответил по новым фильтрам, лента собирается из уже загруженного: больше всего
  // строк — в ленте без фильтров, иначе берём то, что было на экране.
  const allJourneysFeed = queryClient.getQueryData(feedQueryOptions(NO_FEED_FILTERS).queryKey);
  const feed = useInfiniteQuery({
    ...options,
    // У выборки нет курсоров: её не догружают, она живёт до ответа сервера.
    placeholderData: (previous) => {
      const pages = (allJourneysFeed ?? previous)?.pages;
      return pages && { pages: filterFeedPages(pages, filters), pageParams: pages.map(() => null) };
    },
  });
  const { data, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = feed;
  // Выборка из полностью загруженной ленты совпадает с ответом сервера — её не приглушаем.
  const isStale = feed.isPlaceholderData && !isFeedFullyLoaded(allJourneysFeed?.pages);
  const { move, isMoving, errorToken: moveErrorToken } = useJourneyMove(options.queryKey);

  // Перестановку из кэша Query доносит до ленты рендером позже, а dnd-kit снимает сдвиги строк
  // сразу на отпускании — строки на кадр прыгнули бы назад. Поэтому брошенную строку ставим на
  // новое место сами, пока лента показывает те же порции, от которых посчитан перенос.
  const [drop, setDrop] = useState<{ pages: readonly JourneysFeedResponse[]; journeyId: string; target: MoveTarget } | null>(
    null,
  );
  const pages = data?.pages;
  const isDropShown = drop !== null && drop.pages === pages;
  const shownPages = useMemo(
    () => (drop !== null && drop.pages === pages ? moveJourneyInPages(drop.pages, drop.journeyId, drop.target) : (pages ?? [])),
    [drop, pages],
  );
  const groups = useMemo(() => groupFeedByYear(shownPages), [shownPages]);
  const journeys = useMemo(() => groups.flatMap((group) => group.journeys), [groups]);
  const journeyIds = useMemo(() => journeys.map((journey) => journey.journeyId), [journeys]);
  const nameOf = usePlaceNames(journeys.flatMap((journey) => [journey.origin.placeId, journey.destination.placeId]));
  const distanceFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: "unit", unit: "kilometer", maximumFractionDigits: 0 }),
    [i18n.language],
  );

  // Правится не больше одной строки: клик по другой строке переключает правку на неё.
  const [editing, setEditing] = useState<{ journeyId: string; field: JourneyEditField } | null>(null);
  const [dropYear, setDropYear] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // Над какой строкой держат перетаскиваемую и её высота — по ним сдвигаются заголовки лет.
  const [dragOver, setDragOver] = useState<{ overId: string; rowHeight: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Только что сохранённая строка — мигнёт подсветкой.
  const [savedId, setSavedId] = useState<string | null>(null);
  const isDragDisabled = editing !== null || isMoving || feed.isPlaceholderData;

  const containerRef = useRef<HTMLDivElement>(null);
  // Брошенная строка уже стоит там, где её видно, — FLIP только запоминает новые места, иначе
  // проиграл бы перенос заново со старого места.
  useFlip(containerRef, dragId !== null || isDropShown);

  // Строка под курсором или с фокусом внутри — одним слушателем на всю ленту. Фокус, перешедший
  // на соседнюю кнопку той же строки, строку не меняет.
  const hasRows = groups.length > 0;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rowIdOf = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest<HTMLElement>("[data-flip-id]")?.dataset.flipId ?? null) : null;
    const handleEnter = (event: Event) => setHoverId(rowIdOf(event.target));
    const handlePointerLeave = () => setHoverId(null);
    const handleFocusOut = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node && container.contains(event.relatedTarget))) {
        setHoverId(null);
      }
    };
    container.addEventListener("pointerover", handleEnter);
    container.addEventListener("focusin", handleEnter);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("focusout", handleFocusOut);

    return () => {
      container.removeEventListener("pointerover", handleEnter);
      container.removeEventListener("focusin", handleEnter);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("focusout", handleFocusOut);
    };
  }, [hasRows]);

  const activeId = dragId ?? editing?.journeyId ?? hoverId;
  const activeJourney = journeys.find((journey) => journey.journeyId === activeId) ?? null;
  useEffect(() => {
    onJourneysChange(journeys);
  }, [journeys, onJourneysChange]);
  useEffect(() => {
    onActiveJourneyChange(activeJourney);
  }, [activeJourney, onActiveJourneyChange]);

  // Строку тянут только за ручку, поэтому сенсору указателя не нужна задержка: на ручке
  // `touch-action: none`, и палец не скроллит страницу вместо перетаскивания.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const unknownLabel = tCommon("map.unknownPlace");
  const routeOf = (journeyId: string | number) => {
    const journey = journeys.find((item) => item.journeyId === journeyId);
    if (!journey) {
      return "";
    }

    const origin = placeLabel(nameOf(journey.origin.placeId), unknownLabel) ?? "…";
    const destination = placeLabel(nameOf(journey.destination.placeId), unknownLabel) ?? "…";
    return `${origin} → ${destination}`;
  };
  const targetYearOf = (activeId: string | number, overId: string | number) =>
    resolveMoveTarget(journeys, String(activeId), String(overId))?.traveledYear ??
    journeys.find((journey) => journey.journeyId === activeId)?.traveledYear;
  // Без своих объявлений скринридер прочёл бы id строк.
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("all.dnd.start", { route: routeOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("all.dnd.over", { route: routeOf(over.id), year: targetYearOf(active.id, over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t("all.dnd.end", { route: routeOf(active.id), year: targetYearOf(active.id, over.id) }) : undefined,
    onDragCancel: ({ active }) => t("all.dnd.cancel", { route: routeOf(active.id) }),
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setDragId(String(active.id));
    setDropYear(journeys.find((journey) => journey.journeyId === active.id)?.traveledYear ?? null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (over) {
      // Высоту берём здесь: на старте перетаскивания dnd-kit строку ещё не замерил.
      setDragOver({ overId: String(over.id), rowHeight: active.rect.current.initial?.height ?? 0 });
      setDropYear(targetYearOf(active.id, over.id) ?? null);
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragId(null);
    setDragOver(null);
    setDropYear(null);
    const journey = journeys.find((item) => item.journeyId === active.id);
    const target = over ? resolveMoveTarget(journeys, String(active.id), String(over.id)) : null;
    if (journey && target && pages) {
      setDrop({ pages, journeyId: journey.journeyId, target });
      void move(journey, target);
    }
  };

  const handleDragCancel = () => {
    setDragId(null);
    setDragOver(null);
    setDropYear(null);
  };

  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = hasNextPage && !isFetching && !isMoving && !isFetchNextPageError;
  // Наблюдатель пересоздаётся, когда догрузка снова разрешена: если сторож всё ещё на экране,
  // новый наблюдатель сразу сообщит об этом и запросит следующую порцию.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchNextPage();
      }
    });
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [canLoadMore, fetchNextPage]);

  if (feed.isPending) {
    return (
      <output className="all-journeys__status">
        <Loader size="sm" color="gray" />
        <Text size="sm" c="var(--text-muted)">
          {t("all.loading")}
        </Text>
      </output>
    );
  }

  if (feed.isError && !data) {
    return (
      <div className="all-journeys__status" role="alert">
        <Text size="sm" fw={500} c="var(--text-error)">
          {t("all.error")}
        </Text>
        <Button size="xs" variant="subtle" color="gray" loading={isFetching} onClick={() => void feed.refetch()}>
          {t("all.retry")}
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return hasJourneys ? (
      <output className="all-journeys__status">
        <Text size="sm" c="var(--text-muted)">
          {t("all.noMatches")}
        </Text>
      </output>
    ) : (
      <output className="all-journeys__status">
        <Text size="sm" c="var(--text-muted)">
          {t("all.empty")}
        </Text>
        <Link to="/journeys/add" className="all-journeys__add-link">
          {t("all.addFirst")}
        </Link>
      </output>
    );
  }

  return (
    <div
      ref={containerRef}
      className={["journey-feed", isStale && "journey-feed--stale", dragId !== null && "journey-feed--sorting"]
        .filter(Boolean)
        .join(" ")}
      aria-busy={isFetching}
    >
      {moveErrorToken && (
        <Text size="sm" fw={500} c="var(--text-error)" className="journey-feed__error" role="alert">
          {resolveErrorToken(moveErrorToken)}
        </Text>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements, screenReaderInstructions: { draggable: t("all.dnd.instructions") } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={journeyIds} strategy={feedSortingStrategy}>
          {groups.map((group) => {
            const headerId = `journey-year-${group.year}`;
            const headerShift =
              dragId === null || dragOver === null
                ? 0
                : yearHeaderShift({
                    activeIndex: journeyIds.indexOf(dragId),
                    overIndex: journeyIds.indexOf(dragOver.overId),
                    firstRowIndex: journeyIds.indexOf(group.journeys[0].journeyId),
                    height: dragOver.rowHeight,
                  });
            return (
              <section key={group.year} className="journey-feed__year" aria-labelledby={headerId}>
                <YearHeader id={headerId} year={group.year} shift={headerShift} />
                <ol className="journey-feed__rows">
                  {group.journeys.map((journey) =>
                    editing?.journeyId === journey.journeyId ? (
                      <JourneyRowEditor
                        key={journey.journeyId}
                        journey={journey}
                        nameOf={nameOf}
                        focusField={editing.field}
                        onClose={() => setEditing(null)}
                        onSaved={() => setSavedId(journey.journeyId)}
                      />
                    ) : (
                      <JourneyFeedRow
                        key={journey.journeyId}
                        journey={journey}
                        nameOf={nameOf}
                        distanceFormat={distanceFormat}
                        onEdit={(field) => setEditing({ journeyId: journey.journeyId, field })}
                        isDragDisabled={isDragDisabled}
                        dropYear={dropYear}
                        isSaved={savedId === journey.journeyId}
                        onSavedShown={() => setSavedId(null)}
                      />
                    ),
                  )}
                </ol>
              </section>
            );
          })}
        </SortableContext>
      </DndContext>

      {feed.isFetchingNextPage && (
        <div className="journey-feed__more">
          <Loader size="xs" color="gray" />
        </div>
      )}
      {isFetchNextPageError && (
        <div className="journey-feed__more" role="alert">
          <Text size="sm" fw={500} c="var(--text-error)">
            {t("all.loadMoreError")}
          </Text>
          <Button size="xs" variant="subtle" color="gray" onClick={() => void fetchNextPage()}>
            {t("all.retry")}
          </Button>
        </div>
      )}
      <div ref={sentinelRef} className="journey-feed__sentinel" aria-hidden="true" />
    </div>
  );
}
