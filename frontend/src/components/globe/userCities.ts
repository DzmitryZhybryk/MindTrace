/*
 * Адаптер «места пользователя → точки app-global глобуса».
 *
 * Публичная (анонимная) зона кормит глобус курируемыми `ROUTE_CITIES`; авторизованная —
 * реальными посещёнными местами из journeys. Кэш, дедуп запросов и сброс на логауте
 * держит TanStack Query (`getJourneysGlobeOptions` + очистка кэша в `AuthProvider`),
 * здесь остаётся чистое преобразование.
 */
import type { JourneysGlobeResponse } from "../../api/sdk";

/** Посещённый город без названия: названия глобус запрашивает у geo отдельно. */
export interface UserCityPoint {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * Переводит места из ответа глобуса в точки-города. Каждое место бэк отдаёт один раз.
 *
 * Ссылку на функцию Query использует как ключ мемоизации `select`, поэтому она модульная:
 * инлайн-стрелка на каждом рендере отдавала бы новый массив, а `react-globe.gl` сравнивает
 * `htmlElementsData` по идентичности и пересобирал бы весь слой подписей.
 *
 * Args:
 *     response: Ответ `/v1/journeys/globe` как есть.
 *
 * Returns:
 *     Города: id места и координаты.
 */
export function citiesFromJourneysGlobe(response: JourneysGlobeResponse): UserCityPoint[] {
  return response.places.map((place) => ({ id: place.placeId, lat: place.latitude, lng: place.longitude }));
}
