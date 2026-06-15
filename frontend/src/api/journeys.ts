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
  admin1?: string;
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
