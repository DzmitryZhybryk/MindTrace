import type { LanguageCode } from "../i18n";
import { apiFetch } from "./client";

/**
 * Среда передвижения, а не конкретный вид транспорта: наземный/воздушный/водный.
 * String-literal union, зеркалит backend `TransportType` (StrEnum).
 */
export type TransportType = "land" | "air" | "water";

/**
 * Кандидат города из автокомплита (газеттир GeoNames). Идентичность — `geonameId`;
 * остальные поля денормализованы для подписи кандидата и снапшота поездки на бэке.
 */
export type CitySuggestion = {
  geonameId: number;
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  population: number;
};

/**
 * Контракт создания поездки. Дата приблизительная: год обязателен, месяц и день
 * опциональны (точность бэк выводит из заполненности). Города уходят как
 * `geonameId` — снапшот координат/имени/страны делает бэк.
 */
export type CreateJourneyPayload = {
  originGeonameId: number;
  destinationGeonameId: number;
  transportType: TransportType;
  traveledYear: number;
  traveledMonth: number | null;
  traveledDay: number | null;
};

/** Параметры поиска города под автокомплит. */
export type SearchCitiesParams = {
  searchText: string;
  language: LanguageCode;
  limit?: number;
  signal?: AbortSignal;
};

/** Сырой кандидат из ответа `/v1/geo/cities/search` (snake_case бэка). */
type CityResponseBody = {
  geoname_id: number;
  name: string;
  country_code: string;
  latitude: number;
  longitude: number;
  population: number;
};

type CitySearchResponseBody = {
  items: CityResponseBody[];
};

/**
 * Ищет города по префиксу имени для автокомплита поездки.
 *
 * Имена в ответе уже резолвнуты под `language`; порядок — по убыванию населения.
 * `signal` нужен, чтобы отменять устаревшие запросы при быстром наборе.
 */
export async function searchCities({
  searchText,
  language,
  limit = 10,
  signal,
}: SearchCitiesParams): Promise<CitySuggestion[]> {
  const params = new URLSearchParams({
    search_text: searchText,
    language,
    limit: String(limit),
  });
  const response = await apiFetch<CitySearchResponseBody>(`/v1/geo/cities/search/?${params.toString()}`, { signal });
  return response.items.map((item) => ({
    geonameId: item.geoname_id,
    name: item.name,
    countryCode: item.country_code,
    latitude: item.latitude,
    longitude: item.longitude,
    population: item.population,
  }));
}

export function createJourney(payload: CreateJourneyPayload): Promise<void> {
  return apiFetch<void>("/v1/journeys/", {
    method: "POST",
    json: {
      origin_geoname_id: payload.originGeonameId,
      destination_geoname_id: payload.destinationGeonameId,
      transport_type: payload.transportType,
      traveled_year: payload.traveledYear,
      traveled_month: payload.traveledMonth,
      traveled_day: payload.traveledDay,
    },
  });
}
