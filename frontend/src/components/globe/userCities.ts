/*
 * Слой данных «реальные города пользователя» для app-global глобуса.
 *
 * Публичная (анонимная) зона кормит глобус курируемыми `ROUTE_CITIES`; авторизованная —
 * реальными посещёнными городами из journeys. Здесь два звена:
 *   1. `citiesFromJourneysMap` — чистый адаптер агрегата карты в точки глобуса.
 *   2. модульный кэш по `sub` — чтобы не бить `/v1/journeys/map` на каждый вход в /home.
 * Тот же агрегат уже тянет `JourneysMapView` (2D-карта) — глобус лишь второй потребитель.
 */
import { getJourneysMap, type MapCountryResponse } from "../../api/sdk";
import type { GlobeCity } from "./cities";

/**
 * Разворачивает агрегат карты путешествий в плоский список точек-городов для глобуса.
 *
 * Города разбросаны по странам — собираем их в один список и убираем дубли по имени и
 * координатам (одно место, посещённое в разные годы, приходит одной записью, но подстрахуемся).
 * Годы визитов и статус страны глобусу-фону не нужны — отбрасываем.
 *
 * Args:
 *     countries: Страны с городами, как их отдаёт `getJourneysMap`.
 *
 * Returns:
 *     Уникальные города как `GlobeCity` (имя + координаты).
 */
export function citiesFromJourneysMap(countries: readonly MapCountryResponse[]): GlobeCity[] {
  const seen = new Set<string>();
  const cities: GlobeCity[] = [];
  for (const country of countries) {
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

/*
 * Кэш живёт на модуле и ключуется `sub` токена: смена пользователя (логин под другим
 * аккаунтом) промахивается мимо кэша сама, а логаут явно чистит его `clearUserCitiesCache`.
 * Fetch намеренно БЕЗ AbortSignal: это разделяемый fire-once запрос, и отмена одного
 * потребителя не должна «отравлять» кэш для остальных — потребитель гардит свою жизнь
 * mounted-флагом, а не отменой общего запроса.
 *
 * И `getCachedUserCities`, и `loadUserCities` (на попадании) отдают ОДНУ И ТУ ЖЕ ссылку на
 * массив — намеренно: `react-globe.gl` сравнивает `htmlElementsData` по идентичности, и новая
 * ссылка на тех же данных заставляет его пересобрать весь слой подписей. Потребитель массив НЕ
 * мутирует (только читает), поэтому копия не нужна.
 */
interface UserCitiesCache {
  readonly sub: string;
  readonly cities: GlobeCity[];
}

let cached: UserCitiesCache | null = null;
let inflight: { readonly sub: string; readonly promise: Promise<GlobeCity[]> } | null = null;
// Инвалидирует летящие запросы: `clearUserCitiesCache` (логаут) бампает счётчик, и `.then`
// устаревшего запроса, завершившийся уже ПОСЛЕ сброса, не repopulate'ит кэш и не трогает свежий
// `inflight`. Без этого летящий на момент логаута запрос воскресил бы кэш, нарушив «логаут чистит».
let generation = 0;

/**
 * Синхронно отдаёт закэшированные города пользователя, если они уже загружены под этот `sub`.
 *
 * Нужен потребителю, чтобы показать точки мгновенно при повторном входе на /home, не дожидаясь
 * промиса. Промах (другой `sub` / кэш пуст) → `null`.
 */
export function getCachedUserCities(sub: string): GlobeCity[] | null {
  return cached?.sub === sub ? cached.cities : null;
}

/**
 * Загружает города пользователя, кэшируя результат по `sub`.
 *
 * Повторные вызовы с тем же `sub` не бьют по сети: отдаётся кэш или уже летящий запрос
 * (dedup одновременных вызовов). Ошибка сбрасывает in-flight, чтобы следующий вызов
 * попробовал снова.
 *
 * Args:
 *     sub: Идентификатор пользователя из claims access-токена.
 *
 * Returns:
 *     Промис со списком уникальных городов пользователя.
 */
export function loadUserCities(sub: string): Promise<GlobeCity[]> {
  if (cached?.sub === sub) {
    return Promise.resolve(cached.cities);
  }

  if (inflight?.sub === sub) {
    return inflight.promise;
  }

  const requestGeneration = generation;
  const promise = getJourneysMap({ throwOnError: true })
    .then((response) => {
      const cities = citiesFromJourneysMap(response.countries);
      // Записываем в кэш, только если между стартом и ответом не было сброса (логаута).
      if (requestGeneration === generation) {
        cached = { sub, cities };
        inflight = null;
      }

      return cities;
    })
    .catch((error: unknown) => {
      if (requestGeneration === generation) {
        inflight = null;
      }

      throw error;
    });

  inflight = { sub, promise };
  return promise;
}

/**
 * Сбрасывает кэш городов (логаут). Следующий `loadUserCities` пойдёт в сеть заново.
 */
export function clearUserCitiesCache(): void {
  cached = null;
  inflight = null;
  generation += 1;
}
