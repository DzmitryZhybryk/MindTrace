import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router";
import { Button, Loader, Text } from "@mantine/core";

import { placeLabel, usePlaceNames } from "../../api/placeNames";
import { zTransportType, type MovementsMapResponse, type TransportType } from "../../api/sdk";
import type { MapCountry } from "../../components/WorldMap";
import { WorldMap } from "../../components/WorldMap";
import { WORLD_VIEW_BOX, type ViewBox } from "../../components/worldProjection";
import { GeoNamesAttribution } from "./GeoNamesAttribution";
import { MAP_TONE } from "./journeys-data";
import type { JourneysOutletContext } from "./JourneysLayout";
import { connectionBounds } from "./movements/connectionBounds";
import { MovementConnections, type ProjectedConnection } from "./movements/MovementConnections";
import { MovementsControls, type YearWindow } from "./movements/MovementsControls";
import { projectArc } from "./movements/movementGeometry";
import { movementsQueryOptions } from "./movements/movementsQuery";

// Стабильные ссылки на «пусто»: `WorldMap` и слой стрелок пересчитываются по идентичности пропов.
const NO_COUNTRIES: MapCountry[] = [];
const NO_CONNECTIONS: ProjectedConnection[] = [];
const ALL_TRANSPORT_TYPES: TransportType[] = [...zTransportType.options];

interface MovementsData {
  firstYear: number | null;
  lastYear: number | null;
  connections: ProjectedConnection[];
}

/**
 * Проецирует дуги маршрутов один раз на ответ.
 *
 * Модульная (а не инлайн-стрелка) — Query мемоизирует результат `select` по ссылке на функцию.
 */
function toMovementsData(response: MovementsMapResponse): MovementsData {
  return {
    firstYear: response.firstYear,
    lastYear: response.lastYear,
    connections: response.connections.map((connection) => ({
      key: `${connection.origin.placeId}>${connection.destination.placeId}`,
      origin: connection.origin,
      destination: connection.destination,
      years: connection.years,
      arc: projectArc(connection.origin, connection.destination),
    })),
  };
}

/**
 * Под-вкладка «Карта перемещений» — маршрут /journeys/movements: куда пользователь ездил,
 * стрелкой на каждый маршрут, с названиями мест. Маршруты фильтруются окном лет и видами
 * транспорта.
 *
 * Окно лет применяется на клиенте — по годам, пришедшим в каждом маршруте, — поэтому линии
 * меняются прямо по ходу перетаскивания ползунка, без запросов. Транспорт — запросом: пока
 * грузится новый набор, на карте остаются прежние маршруты. Шкала лет, рамка карты и названия
 * мест берутся по всем поездкам, без фильтров: кадр не прыгает. Страны одного цвета, подсказок нет.
 */
export function MovementsMapView() {
  const { t } = useTranslation("journeys");
  const { t: tCommon } = useTranslation("common");
  const { panelRef } = useOutletContext<JourneysOutletContext>();

  const all = useQuery({ ...movementsQueryOptions(), select: toMovementsData });
  const firstYear = all.data?.firstYear ?? null;
  const lastYear = all.data?.lastYear ?? null;
  const allConnections = all.data?.connections ?? NO_CONNECTIONS;

  // Окно лет не задано, пока пользователь не тронул ползунок: тогда — все годы.
  const [selectedWindow, setSelectedWindow] = useState<YearWindow | null>(null);
  const [transportTypes, setTransportTypes] = useState<TransportType[]>(ALL_TRANSPORT_TYPES);
  const hasTransport = transportTypes.length > 0;
  const window = useMemo<YearWindow | null>(
    () => selectedWindow ?? (firstYear !== null && lastYear !== null ? [firstYear, lastYear] : null),
    [selectedWindow, firstYear, lastYear],
  );

  // Все виды транспорта — тот же ключ, что у запроса без фильтра: второй запрос не уходит.
  const shown = useQuery({
    ...movementsQueryOptions(transportTypes),
    select: toMovementsData,
    placeholderData: keepPreviousData,
    enabled: hasTransport,
  });
  const shownConnections = shown.data?.connections;
  // Маршрут виден, если хоть одна его поездка попала в окно лет.
  const connections = useMemo(() => {
    if (!hasTransport || !shownConnections || !window) {
      return NO_CONNECTIONS;
    }

    const [from, to] = window;
    return shownConnections.filter((connection) => connection.years.some((year) => year >= from && year <= to));
  }, [hasTransport, shownConnections, window]);

  const fitBounds = useMemo(
    () => connectionBounds(allConnections.map((connection) => connection.arc)),
    [allConnections],
  );
  const nameOf = usePlaceNames(
    allConnections.flatMap((connection) => [connection.origin.placeId, connection.destination.placeId]),
  );
  const unknownLabel = tCommon("map.unknownPlace");
  const labelOf = useCallback((placeId: string) => placeLabel(nameOf(placeId), unknownLabel), [nameOf, unknownLabel]);

  const overlay = useCallback(
    (view: ViewBox) => (
      <MovementConnections
        connections={connections}
        unitScale={view.width / WORLD_VIEW_BOX.width}
        labelOf={labelOf}
      />
    ),
    [connections, labelOf],
  );

  const isError = all.isError || (hasTransport && shown.isError);
  const retry = () => {
    void all.refetch();
    if (hasTransport) {
      void shown.refetch();
    }
  };

  return (
    <>
      <WorldMap
        className="journeys-map"
        countries={NO_COUNTRIES}
        tone={MAP_TONE}
        fitBounds={fitBounds}
        occluderRef={panelRef}
        isInteractive={false}
        overlay={overlay}
      />
      {all.isPending && (
        <output className="journeys-map-status">
          <Loader size="sm" color="gray" />
          <Text size="sm" c="var(--text-muted)">
            {t("map.loading")}
          </Text>
        </output>
      )}
      {isError && (
        <div className="journeys-map-status" role="alert">
          <Text size="sm" fw={500} c="var(--text-error)">
            {t("map.error")}
          </Text>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            loading={all.isFetching || shown.isFetching}
            onClick={retry}
          >
            {t("map.retry")}
          </Button>
        </div>
      )}
      {all.isSuccess && allConnections.length === 0 && (
        <output className="journeys-map-status">
          <Text size="sm" c="var(--text-muted)">
            {t("movements.empty")}
          </Text>
        </output>
      )}
      {firstYear !== null && lastYear !== null && window && (
        <MovementsControls
          firstYear={firstYear}
          lastYear={lastYear}
          window={window}
          onWindowChange={setSelectedWindow}
          transportTypes={transportTypes}
          onTransportTypesChange={setTransportTypes}
          panelRef={panelRef}
        />
      )}
      <GeoNamesAttribution />
    </>
  );
}
