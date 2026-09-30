import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router";
import { Button, Loader, Text } from "@mantine/core";

import { placeLabel, usePlaceNames } from "../../api/placeNames";
import type { MovementsMapResponse } from "../../api/sdk";
import type { MapCountry } from "../../components/WorldMap";
import { WorldMap } from "../../components/WorldMap";
import { WORLD_VIEW_BOX, type ViewBox } from "../../components/worldProjection";
import { GeoNamesAttribution } from "./GeoNamesAttribution";
import { MAP_TONE } from "./journeys-data";
import type { JourneysOutletContext } from "./JourneysLayout";
import { connectionBounds } from "./movements/connectionBounds";
import { MovementConnections, type ProjectedConnection } from "./movements/MovementConnections";
import { projectArc } from "./movements/movementGeometry";
import { movementsQueryOptions } from "./movements/movementsQuery";

// Стабильные ссылки на «пусто»: `WorldMap` и слой стрелок пересчитываются по идентичности пропов.
const NO_COUNTRIES: MapCountry[] = [];
const NO_CONNECTIONS: ProjectedConnection[] = [];

/**
 * Проецирует дуги маршрутов один раз на ответ.
 *
 * Модульная (а не инлайн-стрелка) — Query мемоизирует результат `select` по ссылке на функцию.
 */
function toProjectedConnections(response: MovementsMapResponse): ProjectedConnection[] {
  return response.connections.map((connection) => ({
    key: `${connection.origin.placeId}>${connection.destination.placeId}`,
    origin: connection.origin,
    destination: connection.destination,
    arc: projectArc(connection.origin, connection.destination),
  }));
}

/**
 * Под-вкладка «Карта перемещений» — маршрут /journeys/movements: куда пользователь ездил,
 * стрелкой на каждый маршрут, с названиями мест. Все страны одного цвета, подсказок нет.
 * Открывается приближенной ко всем маршрутам пользователя, не заходя под панель навигации.
 */
export function MovementsMapView() {
  const { t } = useTranslation("journeys");
  const { t: tCommon } = useTranslation("common");
  const { panelRef } = useOutletContext<JourneysOutletContext>();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    ...movementsQueryOptions(),
    select: toProjectedConnections,
  });

  const connections = data ?? NO_CONNECTIONS;
  const fitBounds = useMemo(() => connectionBounds(connections.map((connection) => connection.arc)), [connections]);

  const nameOf = usePlaceNames(
    connections.flatMap((connection) => [connection.origin.placeId, connection.destination.placeId]),
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
      {isPending && (
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
          <Button size="xs" variant="subtle" color="gray" loading={isFetching} onClick={() => refetch()}>
            {t("map.retry")}
          </Button>
        </div>
      )}
      {!isPending && !isError && connections.length === 0 && (
        <output className="journeys-map-status">
          <Text size="sm" c="var(--text-muted)">
            {t("movements.empty")}
          </Text>
        </output>
      )}
      <GeoNamesAttribution />
    </>
  );
}
