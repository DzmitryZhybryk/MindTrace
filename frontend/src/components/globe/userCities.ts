/*
 * Адаптер «агрегат карты поездок → точки app-global глобуса».
 *
 * Публичная (анонимная) зона кормит глобус курируемыми `ROUTE_CITIES`; авторизованная —
 * реальными посещёнными городами из journeys. Кэш, дедуп запросов и сброс на логауте
 * держит TanStack Query (`getJourneysMapOptions` + очистка кэша в `AuthProvider`),
 * здесь остаётся чистое преобразование. Тот же агрегат читает `JourneysMapView` (2D-карта)
 * — глобус лишь второй потребитель одного queryKey.
 */
import type { JourneysMapResponse } from "../../api/sdk";
import type { GlobeCity } from "./cities";

/**
 * Разворачивает агрегат карты путешествий в плоский список точек-городов для глобуса.
 *
 * Города разбросаны по странам — собираем их в один список и убираем дубли по имени и
 * координатам (одно место, посещённое в разные годы, приходит одной записью, но подстрахуемся).
 * Годы визитов и статус страны глобусу-фону не нужны — отбрасываем.
 *
 * Ссылку на функцию Query использует как ключ мемоизации `select`, поэтому она модульная:
 * инлайн-стрелка на каждом рендере отдавала бы новый массив, а `react-globe.gl` сравнивает
 * `htmlElementsData` по идентичности и пересобирал бы весь слой подписей.
 *
 * Args:
 *     response: Ответ `/v1/journeys/map` как есть.
 *
 * Returns:
 *     Уникальные города как `GlobeCity` (имя + координаты).
 */
export function citiesFromJourneysMap(response: JourneysMapResponse): GlobeCity[] {
  const seen = new Set<string>();
  const cities: GlobeCity[] = [];
  for (const country of response.countries) {
    for (const city of country.cities) {
      const key = `${city.name}|${city.latitude}|${city.longitude}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      cities.push({ name: city.name, lat: city.latitude, lng: city.longitude });
    }
  }

  return cities;
}
