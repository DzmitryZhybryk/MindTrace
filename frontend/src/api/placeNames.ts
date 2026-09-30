import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { toApiLanguage } from "../i18n/apiLanguage";
import { resolvePlaces, type Language } from "./sdk";

// Бэк принимает не больше 1000 id за запрос — большие списки режем на части.
const RESOLVE_CHUNK_SIZE = 1000;

/**
 * Название места для показа:
 * - строка — название на языке интерфейса;
 * - `null` — geo ответил, но такого места не знает (показываем «неизвестное место»);
 * - `undefined` — названия ещё грузятся (или запрос не удался) — ничего не показываем.
 */
export type PlaceName = string | null | undefined;

export type PlaceNameLookup = (placeId: string) => PlaceName;

/**
 * Подпись места для показа: место, которого geo не знает, подписывается `unknownLabel` —
 * иначе оно тихо пропало бы с карты; пока названия грузятся — подписи нет.
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
 * Названия мест на языке интерфейса — для карты и глобуса, где поездки хранят только id мест.
 *
 * Порядок и повторы id не важны: список нормализуется, поэтому карта и глобус с одними и теми
 * же местами делят один запрос и один кэш. Названия мест не меняются — кэш вечный, а при
 * добавлении поездки прошлые названия остаются на экране, пока догружаются новые.
 *
 * Args:
 *     placeIds: Id мест, которым нужны названия.
 *
 * Returns:
 *     Функция `id → название`: строка, `null` для места, которого geo не знает, `undefined`
 *     пока названия грузятся.
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

    // Предыдущие данные (keepPreviousData) могли не спрашивать о новом id — тогда его
    // название ещё грузится, а не «неизвестно».
    return (placeId) => data.names.get(placeId) ?? (data.requested.has(placeId) ? null : undefined);
  }, [data]);
}
