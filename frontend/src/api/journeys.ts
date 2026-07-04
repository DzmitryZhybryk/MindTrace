import { z } from "zod";

import type { MapCountry } from "../components/WorldMap";
import type { LanguageCode } from "../i18n";
import { apiFetch } from "./client";

/**
 * Среда передвижения, а не конкретный вид транспорта: наземный/воздушный/водный.
 * Рантайм-список — единый источник: тип выводится из него, форма строит по нему опции.
 * Значения зеркалят backend `TransportType` (StrEnum); контракт пиннится с обеих сторон —
 * бэк `backend/tests/api/journeys/test_transport_type_contract.py`, фронт `journeys.test.ts`.
 */
export const TRANSPORT_TYPES = ["land", "air", "water"] as const;

export type TransportType = (typeof TRANSPORT_TYPES)[number];

/**
 * Кандидат места из автокомплита (`/v1/geo/places/search`). `placeId` — суррогатный id
 * справочника (стабильный ключ выбора/рендера); вендорский ключ источника наружу не
 * отдаётся. На create `placeId` НЕ уходит — поездка снапшотит данные места, не ссылку.
 */
export type PlaceSuggestion = {
  placeId: string;
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  population: number;
};

/** Снапшот места для тела создания поездки (payload-on-create): без id, только данные. */
export type JourneyPlace = {
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};

/**
 * Контракт создания поездки. Места уходят снапшотом (имя/страна/координаты) — бэк их не
 * резолвит. Дата приблизительная: год обязателен, месяц и день опциональны (точность бэк
 * выводит из заполненности).
 */
export type CreateJourneyPayload = {
  origin: JourneyPlace;
  destination: JourneyPlace;
  transportType: TransportType;
  traveledYear: number;
  traveledMonth: number | null;
  traveledDay: number | null;
};

/** Параметры поиска места под автокомплит. */
export type SearchPlacesParams = {
  searchText: string;
  language: LanguageCode;
  limit?: number;
  signal?: AbortSignal;
};

/**
 * Ищет места по префиксу имени для автокомплита поездки.
 *
 * Имена в ответе уже резолвнуты под `language`; порядок — по убыванию населения. Провод
 * camelCase 1:1 с `PlaceSuggestion` — маппинга нет. `signal` нужен, чтобы отменять
 * устаревшие запросы при быстром наборе.
 */
export async function searchPlaces({
  searchText,
  language,
  limit = 10,
  signal,
}: SearchPlacesParams): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    searchText,
    language,
    limit: String(limit),
  });
  const response = await apiFetch<{ items: PlaceSuggestion[] }>(`/v1/geo/places/search/?${params.toString()}`, {
    signal,
  });
  return response.items;
}

export function createJourney(payload: CreateJourneyPayload): Promise<void> {
  return apiFetch<void>("/v1/journeys/", { method: "POST", json: payload });
}

/*
 * Zod-схема ответа карты путешествий — валидация на HTTP-границе (untrusted input).
 * Контракт зеркалит backend `JourneysMapResponse`: страны по ISO alpha-2, города с
 * координатами и годами визитов. Статуса в проводе нет — эндпоинт по смыслу отдаёт только
 * посещённые страны, статус проставляем в адаптере.
 */
const journeysMapResponseSchema = z.object({
  countries: z.array(
    z.object({
      countryCode: z.string(),
      cities: z.array(
        z.object({
          name: z.string(),
          latitude: z.number(),
          longitude: z.number(),
          years: z.array(z.number()),
        }),
      ),
    }),
  ),
});

/**
 * Загружает агрегат карты путешествий пользователя и адаптирует под `WorldMap`.
 *
 * Бэк отдаёт только посещённые страны (wishlist — отдельный запрос), поэтому статус
 * проставляем здесь: всё, что пришло из journeys, — `visited`. Координаты переименовываем
 * в форму карты (`latitude/longitude` → `lat/lng`); имя страны фронт резолвит из кода
 * (`Intl.DisplayNames`), бэк его не шлёт. Невалидный ответ → исключение (fail fast).
 */
export async function getJourneysMap(signal?: AbortSignal): Promise<MapCountry[]> {
  const response = await apiFetch<unknown>("/v1/journeys/map", { signal });
  const { countries } = journeysMapResponseSchema.parse(response);
  return countries.map(
    (country): MapCountry => ({
      id: country.countryCode,
      status: "visited",
      cities: country.cities.map((city) => ({
        name: city.name,
        lat: city.latitude,
        lng: city.longitude,
        years: city.years,
      })),
    }),
  );
}
