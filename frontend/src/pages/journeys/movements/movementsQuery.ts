import { getMovementsMapOptions, zTransportType, type GetMovementsMapData, type TransportType } from "../../../api/sdk";

/** Фильтры карты перемещений; не заданное поле — без ограничения. */
export interface MovementsFilter {
  yearFrom?: number;
  yearTo?: number;
  transportTypes?: readonly TransportType[];
}

/**
 * Опции запроса карты перемещений — единственное место, где фильтры превращаются в ключ.
 *
 * Одинаковые фильтры дают одинаковый ключ при любом порядке выбора транспорта: виды
 * сортируются, а «выбраны все» равносильно «без фильтра». Ответ не устаревает сам —
 * его сбрасывает добавление поездки.
 */
export function movementsQueryOptions(filter: MovementsFilter = {}) {
  const query: NonNullable<GetMovementsMapData["query"]> = {};
  if (filter.yearFrom !== undefined) {
    query.yearFrom = filter.yearFrom;
  }

  if (filter.yearTo !== undefined) {
    query.yearTo = filter.yearTo;
  }

  if (filter.transportTypes && filter.transportTypes.length < zTransportType.options.length) {
    query.transportType = [...filter.transportTypes].sort();
  }

  return { ...getMovementsMapOptions({ query }), staleTime: Infinity };
}
