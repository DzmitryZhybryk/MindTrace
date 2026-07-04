import type { WorldMapTone } from "../../components/WorldMap";

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
