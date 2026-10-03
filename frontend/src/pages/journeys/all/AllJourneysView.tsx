import { Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getJourneyYearsOptions, zTransportType, type JourneyFeedEntry, type TransportType } from "../../../api/sdk";
import { YearRangeSlider } from "../movements/YearRangeSlider";
import { JourneyFeed } from "./JourneyFeed";
import { TransportChips } from "./TransportChips";
import type { YearRange } from "./yearRange";
import "./all-journeys.css";

const ALL_TRANSPORT_TYPES: TransportType[] = [...zTransportType.options];
const NO_JOURNEYS: readonly JourneyFeedEntry[] = [];

// Карта — декор за лентой: её chunk (карта мира с границами стран) не держит первую отрисовку ленты.
const FeedBackdropMap = lazy(() => import("./FeedBackdropMap").then((m) => ({ default: m.FeedBackdropMap })));

/**
 * Под-вкладка «Все поездки» — маршрут /journeys/all: лента поездок по годам с фильтрами по годам
 * и транспорту.
 *
 * Шкала лет — от первого до последнего года пользователя, без учёта фильтров: она не должна
 * сжиматься от собственного выбора. Ручки, разведённые по краям шкалы, — все годы, без фильтра.
 * За колонкой — приглушённая карта с дугой активной поездки.
 */
export function AllJourneysView() {
  const { t } = useTranslation("journeys");
  const years = useQuery({ ...getJourneyYearsOptions(), staleTime: Infinity });
  const [yearRange, setYearRange] = useState<YearRange | null>(null);
  const [transportTypes, setTransportTypes] = useState<TransportType[]>(ALL_TRANSPORT_TYPES);
  const yearList = years.data?.years ?? [];
  const firstYear = yearList.at(0);
  const lastYear = yearList.at(-1);
  // Ползунок сверяет окно по ссылке — «все годы» не пересоздаём на каждый рендер.
  const yearWindow = useMemo<YearRange>(
    () => yearRange ?? [firstYear ?? 0, lastYear ?? 0],
    [yearRange, firstYear, lastYear],
  );
  const hasTransport = transportTypes.length > 0;
  const columnRef = useRef<HTMLDivElement>(null);
  const [loadedJourneys, setLoadedJourneys] = useState<readonly JourneyFeedEntry[]>(NO_JOURNEYS);
  const [activeJourney, setActiveJourney] = useState<JourneyFeedEntry | null>(null);

  return (
    <div className="all-journeys">
      {/* Фон под колонкой; на узком экране скрыт — колонка там во всю ширину. */}
      <div className="all-journeys__map" aria-hidden="true">
        <Suspense fallback={null}>
          <FeedBackdropMap
            journeys={hasTransport ? loadedJourneys : NO_JOURNEYS}
            activeJourney={hasTransport ? activeJourney : null}
            occluderRef={columnRef}
          />
        </Suspense>
      </div>

      <div ref={columnRef} className="all-journeys__column">
        <section className="all-journeys__filters journeys-card" aria-label={t("all.filters")}>
          <h1 className="all-journeys__title">{t("nav.all")}</h1>
          {/* Один год — выбирать не из чего, шкалы нет. */}
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
              yearRange={yearRange}
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
