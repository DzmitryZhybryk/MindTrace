import type { MapCity, MapCountry, WorldMapTone } from "../../components/WorldMap";
import { CAPITALS } from "../../data/capitals";

// Координаты города по имени из готового датасета столиц (не плодим свой).
function cityCoords(name: string): { lat: number; lng: number } | null {
  const capital = CAPITALS.find((item) => item.name === name);
  return capital ? { lat: capital.lat, lng: capital.lng } : null;
}

interface RawVisit {
  name: string;
  years: number[];
}

interface RawCountry {
  id: string;
  status: "visited" | "wishlist";
  cities?: RawVisit[];
}

/*
 * Черновые данные путешествий. Контракт нарочно совпадает с будущим ответом
 * API: страны по ISO-3166 alpha-3, у посещённых — города с годами визитов
 * (один город можно посетить несколько раз → несколько лет). Wishlist-страны
 * («хочу/мечтаю») идут без городов.
 */
const RAW_COUNTRIES: RawCountry[] = [
  { id: "BLR", status: "visited", cities: [{ name: "Minsk", years: [2021, 2024] }] },
  { id: "DEU", status: "visited", cities: [{ name: "Berlin", years: [2018, 2022] }] },
  { id: "FRA", status: "visited", cities: [{ name: "Paris", years: [2019] }] },
  { id: "ESP", status: "visited", cities: [{ name: "Madrid", years: [2023] }] },
  { id: "PRT", status: "visited", cities: [{ name: "Lisbon", years: [2025] }] },
  { id: "JPN", status: "visited", cities: [{ name: "Tokyo", years: [2019, 2023] }] },
  { id: "THA", status: "visited", cities: [{ name: "Bangkok", years: [2022] }] },
  { id: "NOR", status: "wishlist" },
  { id: "VNM", status: "wishlist" },
  { id: "PER", status: "wishlist" },
];

export const JOURNEYS_COUNTRIES: readonly MapCountry[] = RAW_COUNTRIES.map((country) => ({
  id: country.id,
  status: country.status,
  cities: (country.cities ?? []).flatMap<MapCity>((visit) => {
    const coords = cityCoords(visit.name);
    return coords ? [{ name: visit.name, years: visit.years, ...coords }] : [];
  }),
}));

export const JOURNEYS_STATS = {
  countries: JOURNEYS_COUNTRIES.filter((country) => country.status === "visited").length,
  cities: JOURNEYS_COUNTRIES.reduce((total, country) => total + country.cities.length, 0),
} as const;

/*
 * Палитра трёх статусов на холодном сером базисе (в тон slate-главной).
 * Emerald и amber — средней насыщенности, через жёлто-зелёный переход
 * сочетаются мягко; серый базис их не глушит. Точка-города — почти-чёрная.
 */
export const MAP_TONE: WorldMapTone = {
  land: "#cbd5e1", // slate-300 — заметно темнее светлого центра фона, страны не сливаются
  border: "#94a3b8", // slate-400 — чёткий контур у каждой страны по всей карте
  visited: "#34d399",
  wishlist: "#fbbf24",
  cityDot: "#0f172a",
};
