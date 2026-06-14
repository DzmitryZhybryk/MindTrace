import { useCallback, useId, useMemo, useRef, useState, type MouseEvent } from "react";

import worldData from "../data/world-countries.geo.json";
import "./world-map.css";

/*
 * Плоская карта мира на чистом SVG, без внешних библиотек. Страна = <path>,
 * заливка зависит от статуса (посещена / в планах / не была), города —
 * маленькие точки по координатам. Под курсором страна затемняется, а тултип
 * показывает её название и — для посещённых — список городов с годами визитов.
 * Это черновой движок под дизайн: контракт пропсов (страны по ISO-3166 alpha-3
 * + города с годами) совпадёт с будущим ответом API.
 */

// --- Проекция Equal Earth (Šavrič, Patterson, Jenny, 2018) ----------------
// Равноплощадная: честно показывает «сколько объехал», без раздувания полюсов.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const DEG2RAD = Math.PI / 180;

function project(lng: number, lat: number): [number, number] {
  const lambda = lng * DEG2RAD;
  const phi = lat * DEG2RAD;
  const theta = Math.asin(M * Math.sin(phi));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const x =
    (2 * Math.sqrt(3) * lambda * Math.cos(theta)) /
    (3 * (A1 + 3 * A2 * t2 + 7 * A3 * t6 + 9 * A4 * t6 * t2));
  const y = theta * (A1 + A2 * t2 + A3 * t6 + A4 * t6 * t2);
  return [x, y];
}

// Габариты viewBox выводим из реальных границ проекции, а не подбираем на глаз.
const VIEW_WIDTH = 1000;
const X_MAX = project(180, 0)[0];
const Y_MAX = project(0, 90)[1];
const VIEW_HEIGHT = Math.round((VIEW_WIDTH * Y_MAX) / X_MAX);

function toScreenX(x: number): number {
  return ((x + X_MAX) / (2 * X_MAX)) * VIEW_WIDTH;
}

function toScreenY(y: number): number {
  return ((Y_MAX - y) / (2 * Y_MAX)) * VIEW_HEIGHT;
}

// --- Разбор geo-данных в SVG-пути (один раз при импорте модуля) ------------
type Position = [number, number];
type LinearRing = Position[];
type GeoGeometry =
  | { type: "Polygon"; coordinates: LinearRing[] }
  | { type: "MultiPolygon"; coordinates: LinearRing[][] };

interface CountryFeature {
  id: string;
  properties: { name: string };
  geometry: GeoGeometry;
}

interface WorldCollection {
  features: CountryFeature[];
}

// Если соседние точки кольца «перепрыгивают» антимеридиан (Россия, Фиджи),
// рвём путь, иначе через всю карту тянется горизонтальная клякса.
const ANTIMERIDIAN_JUMP = 180;

// Антарктиду не рисуем — для карты путешествий это лишний шум внизу.
const EXCLUDED_COUNTRIES = new Set(["ATA"]);

function ringToPath(ring: LinearRing): string {
  const segments: string[] = [];
  let prevLng: number | null = null;
  for (const [lng, lat] of ring) {
    const [px, py] = project(lng, lat);
    const command =
      prevLng === null || Math.abs(lng - prevLng) > ANTIMERIDIAN_JUMP ? "M" : "L";
    segments.push(`${command}${toScreenX(px).toFixed(1)} ${toScreenY(py).toFixed(1)}`);
    prevLng = lng;
  }

  return segments.length > 0 ? `${segments.join("")}Z` : "";
}

function geometryToPath(geometry: GeoGeometry): string {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringToPath).join("");
  }

  return geometry.coordinates.flatMap((polygon) => polygon.map(ringToPath)).join("");
}

interface CountryShape {
  id: string;
  name: string;
  path: string;
}

const COUNTRY_SHAPES: readonly CountryShape[] = (worldData as unknown as WorldCollection).features
  .filter((feature) => !EXCLUDED_COUNTRIES.has(feature.id))
  .map((feature) => ({
    id: feature.id,
    name: feature.properties.name,
    path: geometryToPath(feature.geometry),
  }));

const COUNTRY_NAMES: ReadonlyMap<string, string> = new Map(
  COUNTRY_SHAPES.map((shape) => [shape.id, shape.name]),
);

// --- Публичный API компонента ---------------------------------------------
export type CountryStatus = "visited" | "wishlist";

export interface MapCity {
  name: string;
  lat: number;
  lng: number;
  years: readonly number[];
}

export interface MapCountry {
  id: string;
  status: CountryStatus;
  cities: readonly MapCity[];
}

export interface WorldMapTone {
  /** Заливка непосещённой страны. */
  land: string;
  /** Цвет границ. */
  border: string;
  /** Заливка посещённой страны. */
  visited: string;
  /** Заливка страны из планов/мечт (без городов). */
  wishlist: string;
  /** Цвет точки-города. */
  cityDot: string;
}

interface WorldMapProps {
  countries: readonly MapCountry[];
  tone: WorldMapTone;
  className?: string;
}

export function WorldMap({ countries, tone, className }: WorldMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const byId = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries],
  );

  const handleMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }, []);

  // Страны и точки городов не зависят от hover/позиции курсора (подсветка —
  // через CSS :hover), поэтому мемоизируем: перемещение мыши перерисовывает
  // только тултип, а не все ~180 path'ей.
  const shapes = useMemo(() => {
    const cityDots = countries.flatMap((country) =>
      country.cities.map((city) => {
        const [px, py] = project(city.lng, city.lat);
        return { key: `${country.id}:${city.name}`, cx: toScreenX(px), cy: toScreenY(py) };
      }),
    );

    return (
      <>
        <g>
          {COUNTRY_SHAPES.map((country) => {
            const status = byId.get(country.id)?.status;
            const fill =
              status === "visited"
                ? tone.visited
                : status === "wishlist"
                  ? tone.wishlist
                  : tone.land;
            return (
              <path
                key={country.id}
                className="world-map__country"
                d={country.path}
                fill={fill}
                stroke={tone.border}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
                onMouseEnter={() => setHoveredId(country.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            );
          })}
        </g>
        <g className="world-map__cities">
          {cityDots.map((dot) => (
            <circle
              key={dot.key}
              className="world-map__city-dot"
              cx={dot.cx}
              cy={dot.cy}
              r={1.8}
              fill={tone.cityDot}
              stroke="#ffffff"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </>
    );
  }, [byId, countries, tone]);

  const hovered = hoveredId ? byId.get(hoveredId) : undefined;
  const hoveredName = hoveredId ? (COUNTRY_NAMES.get(hoveredId) ?? hoveredId) : "";

  return (
    <div
      ref={wrapRef}
      className={className ? `world-map-wrap ${className}` : "world-map-wrap"}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredId(null)}
    >
      <svg
        className="world-map"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        aria-labelledby={titleId}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Нативное доступное имя SVG: <title> вместо role="img"+aria-label
            (последнее ловит jsx-a11y/prefer-tag-over-role и хуже переносится по AT). */}
        <title id={titleId}>World map highlighting visited countries</title>
        {shapes}
      </svg>

      {hoveredId && (
        <div className="world-map__tooltip" style={{ left: pointer.x, top: pointer.y }}>
          <span className="world-map__tooltip-title">{hoveredName}</span>
          {hovered?.status === "visited" && hovered.cities.length > 0 ? (
            <ul className="world-map__tooltip-cities">
              {hovered.cities.map((city) => (
                <li key={city.name}>
                  <span className="world-map__tooltip-city">{city.name}</span>
                  <span className="world-map__tooltip-years">{city.years.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="world-map__tooltip-muted">
              {hovered?.status === "wishlist" ? "On your wishlist" : "Not visited yet"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
