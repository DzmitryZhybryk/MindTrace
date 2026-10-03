import { Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getJourneyYearsOptions, zTransportType, type JourneyFeedEntry, type TransportType } from "../../../api/sdk";
import { YearRangeSlider } from "../movements/YearRangeSlider";
import { JourneyFeed } from "./JourneyFeed";
import { TransportChips } from "./TransportChips";
import { fitYearRange, type YearRange } from "./yearRange";
import "./all-journeys.css";

const ALL_TRANSPORT_TYPES: TransportType[] = [...zTransportType.options];
const NO_JOURNEYS: readonly JourneyFeedEntry[] = [];

// The map is decor behind the feed: its chunk (world map with country borders) must not hold up the feed's first paint.
const FeedBackdropMap = lazy(() => import("./FeedBackdropMap").then((m) => ({ default: m.FeedBackdropMap })));
// Same breakpoint as the layout in all-journeys.css: narrower means a full-width column with no room for the map.
const DESKTOP_QUERY = "(min-width: 62em)";

/**
 * "All journeys" sub-tab, route /journeys/all: a feed of journeys by year with year and
 * transport filters.
 *
 * The year scale runs from the user's first to last year, ignoring filters: it must not shrink
 * from its own selection. Thumbs at the scale edges mean all years, no filter. Behind the column
 * is a muted map with the active journey's arc.
 */
export function AllJourneysView() {
  const { t } = useTranslation("journeys");
  const years = useQuery({ ...getJourneyYearsOptions(), staleTime: Infinity });
  const [yearRange, setYearRange] = useState<YearRange | null>(null);
  const [transportTypes, setTransportTypes] = useState<TransportType[]>(ALL_TRANSPORT_TYPES);
  const yearList = years.data?.years ?? [];
  const firstYear = yearList.at(0);
  const lastYear = yearList.at(-1);
  const shownYearRange = useMemo(
    () => fitYearRange(yearRange, firstYear, lastYear),
    [yearRange, firstYear, lastYear],
  );
  // The slider compares the window by reference, so do not recreate "all years" every render.
  const yearWindow = useMemo<YearRange>(
    () => shownYearRange ?? [firstYear ?? 0, lastYear ?? 0],
    [shownYearRange, firstYear, lastYear],
  );
  const isDesktop = useMediaQuery(DESKTOP_QUERY, false, { getInitialValueInEffect: false });
  const hasTransport = transportTypes.length > 0;
  const columnRef = useRef<HTMLDivElement>(null);
  const [loadedJourneys, setLoadedJourneys] = useState<readonly JourneyFeedEntry[]>(NO_JOURNEYS);
  const [activeJourney, setActiveJourney] = useState<JourneyFeedEntry | null>(null);

  return (
    <div className="all-journeys">
      {/* Background under the column; absent on narrow screens where the column is full width. */}
      {isDesktop && (
        <div className="all-journeys__map" aria-hidden="true">
          <Suspense fallback={null}>
            <FeedBackdropMap
              journeys={hasTransport ? loadedJourneys : NO_JOURNEYS}
              activeJourney={hasTransport ? activeJourney : null}
              occluderRef={columnRef}
            />
          </Suspense>
        </div>
      )}

      <div ref={columnRef} className="all-journeys__column">
        <section className="all-journeys__filters journeys-card" aria-label={t("all.filters")}>
          <h1 className="all-journeys__title">{t("nav.all")}</h1>
          {/* A single year leaves nothing to choose, so no scale. */}
          {firstYear !== undefined && lastYear !== undefined && firstYear < lastYear && (
            <fieldset className="all-journeys__years">
              <legend className="all-journeys__filter-label">{t("all.years")}</legend>
              <YearRangeSlider
                firstYear={firstYear}
                lastYear={lastYear}
                window={yearWindow}
                onWindowChange={([from, to]) => setYearRange(from === firstYear && to === lastYear ? null : [from, to])}
                fromLabel={t("movements.yearFrom")}
                toLabel={t("movements.yearTo")}
              />
            </fieldset>
          )}
          <TransportChips transportTypes={transportTypes} onTransportTypesChange={setTransportTypes} />
        </section>

        <section className="all-journeys__feed journeys-card" aria-label={t("all.feed")}>
          {hasTransport ? (
            <JourneyFeed
              yearRange={shownYearRange}
              transportTypes={transportTypes}
              hasJourneys={yearList.length > 0}
              onJourneysChange={setLoadedJourneys}
              onActiveJourneyChange={setActiveJourney}
            />
          ) : (
            <output className="all-journeys__status">
              <Text size="sm" c="var(--text-muted)">
                {t("movements.noTransport")}
              </Text>
            </output>
          )}
        </section>
      </div>
    </div>
  );
}
