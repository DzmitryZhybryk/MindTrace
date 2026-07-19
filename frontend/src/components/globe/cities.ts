/*
 * Пул городов для наборов маршрутов (`routes.ts`). Города сгруппированы по континентам:
 * набор берёт ровно по 2 с каждого континента, поэтому группировка здесь — рабочий
 * инструмент подбора, а не украшение.
 *
 * Континент у города — не справочная метка, а часть правила рисунка: дуга никогда не
 * соединяет два города одного континента. Honolulu, Papeete и Apia отнесены к Океании
 * (Полинезия) по географии, а не по гражданству — они держат центр Тихого океана,
 * иначе эта грань планеты пустует.
 */

export type Continent =
  | "africa"
  | "asia"
  | "europe"
  | "northAmerica"
  | "oceania"
  | "southAmerica";

export interface City {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly continent: Continent;
}

export const CITIES = {
  // --- Северная Америка ---
  newYork: { name: "New York", lat: 40.7128, lng: -74.006, continent: "northAmerica" },
  vancouver: { name: "Vancouver", lat: 49.2827, lng: -123.1207, continent: "northAmerica" },
  sanFrancisco: { name: "San Francisco", lat: 37.7749, lng: -122.4194, continent: "northAmerica" },
  mexicoCity: { name: "Mexico City", lat: 19.4326, lng: -99.1332, continent: "northAmerica" },
  chicago: { name: "Chicago", lat: 41.8781, lng: -87.6298, continent: "northAmerica" },
  havana: { name: "Havana", lat: 23.1136, lng: -82.3666, continent: "northAmerica" },
  montreal: { name: "Montreal", lat: 45.5019, lng: -73.5674, continent: "northAmerica" },
  losAngeles: { name: "Los Angeles", lat: 34.0522, lng: -118.2437, continent: "northAmerica" },
  anchorage: { name: "Anchorage", lat: 61.2181, lng: -149.9003, continent: "northAmerica" },
  miami: { name: "Miami", lat: 25.7617, lng: -80.1918, continent: "northAmerica" },

  // --- Южная Америка ---
  cusco: { name: "Cusco", lat: -13.532, lng: -71.9675, continent: "southAmerica" },
  rio: { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, continent: "southAmerica" },
  buenosAires: { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, continent: "southAmerica" },
  bogota: { name: "Bogotá", lat: 4.711, lng: -74.0721, continent: "southAmerica" },
  quito: { name: "Quito", lat: -0.1807, lng: -78.4678, continent: "southAmerica" },
  santiago: { name: "Santiago", lat: -33.4489, lng: -70.6693, continent: "southAmerica" },
  saoPaulo: { name: "São Paulo", lat: -23.5505, lng: -46.6333, continent: "southAmerica" },
  ushuaia: { name: "Ushuaia", lat: -54.8019, lng: -68.303, continent: "southAmerica" },
  lima: { name: "Lima", lat: -12.0464, lng: -77.0428, continent: "southAmerica" },

  // --- Европа ---
  reykjavik: { name: "Reykjavík", lat: 64.1466, lng: -21.9426, continent: "europe" },
  istanbul: { name: "Istanbul", lat: 41.0082, lng: 28.9784, continent: "europe" },
  lisbon: { name: "Lisbon", lat: 38.7223, lng: -9.1393, continent: "europe" },
  stockholm: { name: "Stockholm", lat: 59.3293, lng: 18.0686, continent: "europe" },
  dublin: { name: "Dublin", lat: 53.3498, lng: -6.2603, continent: "europe" },
  rome: { name: "Rome", lat: 41.9028, lng: 12.4964, continent: "europe" },
  edinburgh: { name: "Edinburgh", lat: 55.9533, lng: -3.1883, continent: "europe" },
  athens: { name: "Athens", lat: 37.9838, lng: 23.7275, continent: "europe" },
  helsinki: { name: "Helsinki", lat: 60.1699, lng: 24.9384, continent: "europe" },
  barcelona: { name: "Barcelona", lat: 41.3874, lng: 2.1686, continent: "europe" },

  // --- Африка ---
  marrakesh: { name: "Marrakesh", lat: 31.6295, lng: -7.9811, continent: "africa" },
  capeTown: { name: "Cape Town", lat: -33.9249, lng: 18.4241, continent: "africa" },
  cairo: { name: "Cairo", lat: 30.0444, lng: 31.2357, continent: "africa" },
  nairobi: { name: "Nairobi", lat: -1.2921, lng: 36.8219, continent: "africa" },
  dakar: { name: "Dakar", lat: 14.7167, lng: -17.4677, continent: "africa" },
  zanzibar: { name: "Zanzibar", lat: -6.1659, lng: 39.2026, continent: "africa" },
  lagos: { name: "Lagos", lat: 6.5244, lng: 3.3792, continent: "africa" },
  antananarivo: { name: "Antananarivo", lat: -18.8792, lng: 47.5079, continent: "africa" },
  tunis: { name: "Tunis", lat: 36.8065, lng: 10.1815, continent: "africa" },
  maputo: { name: "Maputo", lat: -25.9692, lng: 32.5732, continent: "africa" },

  // --- Азия ---
  delhi: { name: "Delhi", lat: 28.6139, lng: 77.209, continent: "asia" },
  tokyo: { name: "Tokyo", lat: 35.6762, lng: 139.6503, continent: "asia" },
  shanghai: { name: "Shanghai", lat: 31.2304, lng: 121.4737, continent: "asia" },
  dubai: { name: "Dubai", lat: 25.2048, lng: 55.2708, continent: "asia" },
  kathmandu: { name: "Kathmandu", lat: 27.7172, lng: 85.324, continent: "asia" },
  singapore: { name: "Singapore", lat: 1.3521, lng: 103.8198, continent: "asia" },
  seoul: { name: "Seoul", lat: 37.5665, lng: 126.978, continent: "asia" },
  samarkand: { name: "Samarkand", lat: 39.627, lng: 66.975, continent: "asia" },
  bangkok: { name: "Bangkok", lat: 13.7563, lng: 100.5018, continent: "asia" },
  vladivostok: { name: "Vladivostok", lat: 43.1332, lng: 131.9113, continent: "asia" },

  // --- Океания ---
  sydney: { name: "Sydney", lat: -33.8688, lng: 151.2093, continent: "oceania" },
  honolulu: { name: "Honolulu", lat: 21.3069, lng: -157.8583, continent: "oceania" },
  auckland: { name: "Auckland", lat: -36.8485, lng: 174.7633, continent: "oceania" },
  papeete: { name: "Papeete", lat: -17.5516, lng: -149.5585, continent: "oceania" },
  perth: { name: "Perth", lat: -31.9523, lng: 115.8613, continent: "oceania" },
  suva: { name: "Suva", lat: -18.1416, lng: 178.4419, continent: "oceania" },
  wellington: { name: "Wellington", lat: -41.2866, lng: 174.7756, continent: "oceania" },
  brisbane: { name: "Brisbane", lat: -27.4698, lng: 153.0251, continent: "oceania" },
  apia: { name: "Apia", lat: -13.8333, lng: -171.7667, continent: "oceania" },
} satisfies Record<string, City>;
