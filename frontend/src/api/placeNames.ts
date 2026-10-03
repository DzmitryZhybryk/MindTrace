import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { toApiLanguage } from "../i18n/apiLanguage";
import { resolvePlaces, type Language } from "./sdk";

// The backend accepts at most 1000 ids per request, so larger lists are split into chunks.
const RESOLVE_CHUNK_SIZE = 1000;

/**
 * Place name to display:
 * - string: the name in the UI language;
 * - `null`: geo answered but does not know the place (show an "unknown place" label);
 * - `undefined`: still loading (or the request failed), show nothing.
 */
export type PlaceName = string | null | undefined;

export type PlaceNameLookup = (placeId: string) => PlaceName;

/**
 * Label for a place. A place geo does not know gets `unknownLabel` (otherwise it would vanish
 * from the map silently); while names load there is no label.
 */
export function placeLabel(name: PlaceName, unknownLabel: string): string | undefined {
  return name === null ? unknownLabel : name;
}

interface ResolvedNames {
  requested: ReadonlySet<string>;
  names: ReadonlyMap<string, string>;
}

const NOTHING_LOADED: PlaceNameLookup = () => undefined;

async function fetchPlaceNames(placeIds: readonly string[], language: Language, signal: AbortSignal): Promise<ResolvedNames> {
  const chunks: string[][] = [];
  for (let start = 0; start < placeIds.length; start += RESOLVE_CHUNK_SIZE) {
    chunks.push(placeIds.slice(start, start + RESOLVE_CHUNK_SIZE));
  }

  const responses = await Promise.all(
    chunks.map((chunk) => resolvePlaces({ body: { placeIds: chunk, language }, signal, throwOnError: true })),
  );
  const names = new Map<string, string>();
  for (const response of responses) {
    for (const item of response.items) {
      names.set(item.placeId, item.name);
    }
  }

  return { requested: new Set(placeIds), names };
}

/**
 * Place names in the UI language, for the map and globe, where journeys store only place ids.
 *
 * Id order and duplicates do not matter: the list is normalized, so the map and globe share one
 * request and one cache. Names never change, so the cache is permanent, and previous names stay
 * on screen while names for a newly added journey load.
 *
 * Returns an `id -> name` lookup (see `PlaceName`).
 */
export function usePlaceNames(placeIds: Iterable<string>): PlaceNameLookup {
  const { i18n } = useTranslation();
  const language = toApiLanguage(i18n.language);

  const idsKey = [...new Set(placeIds)].sort().join(",");
  const normalizedIds = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);

  const { data } = useQuery({
    queryKey: ["placeNames", language, normalizedIds],
    queryFn: ({ signal }) => fetchPlaceNames(normalizedIds, language, signal),
    enabled: normalizedIds.length > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  return useMemo<PlaceNameLookup>(() => {
    if (!data) {
      return NOTHING_LOADED;
    }

    // keepPreviousData may hold results that never asked about a new id: its name is still
    // loading, not "unknown".
    return (placeId) => data.names.get(placeId) ?? (data.requested.has(placeId) ? null : undefined);
  }, [data]);
}
