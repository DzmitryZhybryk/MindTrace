/**
 * Общие текстуры/настройки глобусов (AuthGlobe, HomeGlobe, JourneyGlobe) — один источник правды.
 * Текстуры пока грузятся с внешнего CDN (jsdelivr); версия three-globe запинена (не `latest`),
 * чтобы ассет не подменился при обновлении пакета — держать в синхроне с package-lock.
 * TODO: перенести на своё S3-хранилище (см. ZTODO).
 */
const THREE_GLOBE_VERSION = "2.45.2";
const CDN_IMG_BASE = `https://cdn.jsdelivr.net/npm/three-globe@${THREE_GLOBE_VERSION}/example/img`;
export const GLOBE_TEXTURE_URL = `${CDN_IMG_BASE}/earth-blue-marble.jpg`;
export const GLOBE_BUMP_URL = `${CDN_IMG_BASE}/earth-topology.png`;
export const GLOBE_ATMOSPHERE_COLOR = "#4ab3ff";
