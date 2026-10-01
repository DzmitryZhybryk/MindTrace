import { getMovementsMapOptions, zTransportType, type GetMovementsMapData, type TransportType } from "../../../api/sdk";

/**
 * Опции запроса карты перемещений — единственное место, где фильтр транспорта превращается в
 * ключ. Окна лет в запросе нет: годы приходят в каждом маршруте, окно применяется на клиенте.
 *
 * Одинаковый набор транспорта даёт одинаковый ключ при любом порядке выбора: виды сортируются,
 * а «выбраны все» (или набор не задан) равносильно «без фильтра». Ответ не устаревает сам — его
 * сбрасывает добавление поездки.
 */
export function movementsQueryOptions(transportTypes?: readonly TransportType[]) {
  const query: NonNullable<GetMovementsMapData["query"]> = {};
  if (transportTypes && transportTypes.length < zTransportType.options.length) {
    query.transportType = [...transportTypes].sort();
  }

  return { ...getMovementsMapOptions({ query }), staleTime: Infinity };
}
