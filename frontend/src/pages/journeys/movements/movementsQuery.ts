import { getMovementsMapOptions, zTransportType, type GetMovementsMapData, type TransportType } from "../../../api/sdk";

/**
 * Movements map query options: the only place where the transport filter becomes a key. There is
 * no year window in the request: years arrive in every route and the window applies on the client.
 *
 * The same transport set gives the same key in any selection order: types are sorted, and "all
 * selected" (or no set) equals "no filter". The response never goes stale by itself; adding a
 * journey invalidates it.
 */
export function movementsQueryOptions(transportTypes?: readonly TransportType[]) {
  const query: NonNullable<GetMovementsMapData["query"]> = {};
  if (transportTypes && transportTypes.length < zTransportType.options.length) {
    query.transportType = [...transportTypes].sort();
  }

  return { ...getMovementsMapOptions({ query }), staleTime: Infinity };
}
