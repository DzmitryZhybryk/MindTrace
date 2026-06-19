const DEG = Math.PI / 180;

/**
 * Угловое расстояние (центральный угол, радианы) между двумя гео-точками — haversine.
 *
 * Общий гео-примитив глобусов: JourneyGlobe берёт радианы напрямую (под altitude-зум),
 * AuthGlobe оборачивает в `toDeg` (порог видимости столиц в градусах).
 */
export function centralAngleRad(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = lat1 * DEG;
  const phi2 = lat2 * DEG;
  const dPhi = (lat2 - lat1) * DEG;
  const dLam = (lng2 - lng1) * DEG;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Радианы → градусы. */
export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
