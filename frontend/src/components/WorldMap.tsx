import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import worldTopology from "../data/world-countries.topo.json";
import { fitView } from "./fitView";
import { useMapZoom } from "./useMapZoom";
import { useViewTransition } from "./useViewTransition";
import { ANTIMERIDIAN_JUMP, WORLD_VIEW_BOX, isWorldView, projectToScreen, type ViewBox } from "./worldProjection";
import "./world-map.css";

/*
 * Плоская карта мира на чистом SVG, без внешних библиотек. Страна = <path>,
 * заливка зависит от статуса (посещена / в планах / не была), города —
 * маленькие точки по координатам. Под курсором страна затемняется, а тултип
 * показывает её название и — для посещённых — список городов с годами визитов.
 * Карту приближают и двигают жестами (см. useMapZoom); поверх стран можно нарисовать
 * свой слой (overlay) в координатах холста.
 */

// --- Разбор geo-данных в SVG-пути (один раз при импорте модуля) ------------
type CountryGeometry = Polygon | MultiPolygon;

interface CountryProperties {
  name: string;
}

type CountryFeature = Feature<CountryGeometry, CountryProperties> & { id: string };

type WorldTopology = Topology<{ countries: GeometryCollection<CountryProperties> }>;

function ringToPath(ring: Position[]): string {
  const segments: string[] = [];
  let prevLng: number | null = null;
  for (const [lng, lat] of ring) {
    const [x, y] = projectToScreen(lng, lat);
    const command =
      prevLng === null || Math.abs(lng - prevLng) > ANTIMERIDIAN_JUMP ? "M" : "L";
    segments.push(`${command}${x.toFixed(1)} ${y.toFixed(1)}`);
    prevLng = lng;
  }

  return segments.length > 0 ? `${segments.join("")}Z` : "";
}

function geometryToPath(geometry: CountryGeometry): string {
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

// Топологию собирает scripts/build-world-topology.ts из стран-полигонов, у каждой есть
// строковый id и имя, — поэтому раскрытые обратно фичи и есть CountryFeature.
const WORLD = worldTopology as unknown as WorldTopology;
const COUNTRY_FEATURES = feature(WORLD, WORLD.objects.countries).features as CountryFeature[];

const COUNTRY_SHAPES: readonly CountryShape[] = COUNTRY_FEATURES.map((country) => ({
  id: country.id,
  name: country.properties.name,
  path: geometryToPath(country.geometry),
}));

const COUNTRY_NAMES: ReadonlyMap<string, string> = new Map(
  COUNTRY_SHAPES.map((shape) => [shape.id, shape.name]),
);

// --- Публичный API компонента ---------------------------------------------
export type CountryStatus = "visited" | "wishlist";

export interface MapCity {
  /** Id места в geo. */
  id: string;
  /** Название на языке интерфейса; нет, пока названия ещё грузятся. */
  name?: string;
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
  /**
   * Слой поверх стран, в координатах холста (см. `projectToScreen`). Получает текущую
   * видимую область — чтобы подписи и значки не росли при приближении вместе с картой.
   */
  overlay?: (view: ViewBox) => ReactNode;
  /** Что показать на старте (в единицах холста); без него карта открывается всем миром. */
  fitBounds?: ViewBox | null;
  /**
   * Элемент поверх левой части карты (панель): стартовый вид подгоняется в незакрытую часть, а
   * карта растворяется к его кромке — линии не выныривают из-под него.
   */
  occluderRef?: RefObject<HTMLElement | null>;
  /**
   * `false` — карта не растворяется к кромке `occluderRef`: элемент поверх неё прозрачный, и
   * карту видно сквозь него. Стартовый вид всё равно подгоняется в незакрытую часть.
   */
  shouldFadeUnderOccluder?: boolean;
  /** Смена `fitBounds` переводит карту к новому виду плавно, а не прыжком. */
  isFitAnimated?: boolean;
  /** `false` — страны не подсвечиваются под курсором и тултипа нет; масштаб при этом работает. */
  isInteractive?: boolean;
}

// Точка города в единицах холста при виде на весь мир; при приближении пропорционально меньше.
const CITY_DOT_RADIUS = 1.8;

// Отступ тултипа от курсора и запасные размеры (до первого замера ref'а).
const TOOLTIP_OFFSET = 14;
const TOOLTIP_FALLBACK_WIDTH = 160;
const TOOLTIP_FALLBACK_HEIGHT = 80;

export function WorldMap({
  countries,
  tone,
  className,
  overlay,
  fitBounds = null,
  occluderRef,
  shouldFadeUnderOccluder = true,
  isFitAnimated = false,
  isInteractive = true,
}: WorldMapProps) {
  const { t, i18n } = useTranslation("common");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Сколько пикселей слева закрывает панель и каким быть стартовому виду — зависит от размера
  // области карты, поэтому пересчитываем до отрисовки и при каждом изменении размера.
  const [initialView, setInitialView] = useState<ViewBox>(WORLD_VIEW_BOX);
  const [occludedLeft, setOccludedLeft] = useState(0);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if ((!fitBounds && !occluderRef) || !canvas) {
      setInitialView(WORLD_VIEW_BOX);
      setOccludedLeft(0);
      return;
    }

    const measure = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const occluderRect = occluderRef?.current?.getBoundingClientRect();
      // Панель закрывает карту, только если лежит поверх неё; на мобильной ширине она над картой.
      const isOverlapping =
        occluderRect !== undefined &&
        occluderRect.left < canvasRect.right &&
        occluderRect.right > canvasRect.left &&
        occluderRect.top < canvasRect.bottom &&
        occluderRect.bottom > canvasRect.top;
      const occluded = isOverlapping ? occluderRect.right - canvasRect.left : 0;
      setOccludedLeft(occluded);
      setInitialView(fitBounds ? fitView(fitBounds, canvasRect, occluded) : WORLD_VIEW_BOX);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fitBounds, occluderRef]);

  const fittedView = useViewTransition(initialView, isFitAnimated);
  const view = useMapZoom(canvasRef, svgRef, fittedView);
  const isFadedUnderOccluder = shouldFadeUnderOccluder && occludedLeft > 0;
  const isZoomed = !isWorldView(view);
  // Геометрию контейнера кешируем на входе курсора, а не дёргаем
  // getBoundingClientRect (форсит reflow) на каждое движение мыши.
  const rectRef = useRef<DOMRect | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [flip, setFlip] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  const byId = useMemo(
    () => new Map(countries.map((country) => [country.id, country])),
    [countries],
  );

  // Имя страны резолвим из ISO-кода через CLDR по активному языку; безкодовые
  // территории (id=имя) и неизвестные коды → fallback на имя из данных границ.
  const countryNames = useMemo(
    () => new Intl.DisplayNames([i18n.language], { type: "region", fallback: "none" }),
    [i18n.language],
  );
  const resolveCountryName = useCallback(
    (id: string): string => {
      if (/^[A-Z]{2}$/u.test(id)) {
        const localized = countryNames.of(id);
        if (localized && localized !== id) return localized;
      }

      return COUNTRY_NAMES.get(id) ?? id;
    },
    [countryNames],
  );

  const cacheRect = useCallback(() => {
    rectRef.current = wrapRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    // Обычно геометрия закеширована на onMouseEnter, но он не срабатывает, если
    // курсор уже был над картой в момент её появления (клиентская навигация после
    // добавления поездки). Тогда меряем лениво здесь — иначе rect=null, ранний
    // выход, и тултип залипает в левом верхнем углу (pointer остаётся {0,0}).
    const rect = rectRef.current ?? wrapRef.current?.getBoundingClientRect() ?? null;
    // Оборонительный guard: getBoundingClientRect у смонтированного узла всегда даёт rect.
    /* v8 ignore next 3 */
    if (!rect) {
      return;
    }

    rectRef.current = rect;
    setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    // Флип у края экрана: если справа/снизу тултип не помещается — рисуем его
    // слева/сверху от курсора. Меряем по viewport (clientX/Y), чтобы не вылезти
    // за экран; размеры берём с прошлого кадра (меняются только при смене страны).
    const tooltip = tooltipRef.current;
    const width = tooltip?.offsetWidth ?? TOOLTIP_FALLBACK_WIDTH;
    const height = tooltip?.offsetHeight ?? TOOLTIP_FALLBACK_HEIGHT;
    setFlip({
      x: event.clientX + TOOLTIP_OFFSET + width > window.innerWidth,
      y: event.clientY + TOOLTIP_OFFSET + height > window.innerHeight,
    });
  }, []);

  // Страны не зависят ни от hover/позиции курсора (подсветка — через CSS :hover), ни от
  // масштаба (он меняет только viewBox), поэтому мемоизируем: движение мыши и зум не
  // перерисовывают ~180 path'ей.
  const countryShapes = useMemo(
    () => (
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
              onMouseEnter={isInteractive ? () => setHoveredId(country.id) : undefined}
              onMouseLeave={isInteractive ? () => setHoveredId(null) : undefined}
            />
          );
        })}
      </g>
    ),
    [byId, tone, isInteractive],
  );

  const cityDots = useMemo(
    () =>
      countries.flatMap((country) =>
        country.cities.map((city) => {
          const [cx, cy] = projectToScreen(city.lng, city.lat);
          return { key: city.id, cx, cy };
        }),
      ),
    [countries],
  );
  const cityDotRadius = CITY_DOT_RADIUS * (view.width / WORLD_VIEW_BOX.width);

  const hovered = hoveredId ? byId.get(hoveredId) : undefined;
  const hoveredName = hoveredId ? resolveCountryName(hoveredId) : "";
  // Города без названия (ещё грузятся) в тултип не попадают — показываем их, как только придут.
  // Порядок — по году первого визита (годы приходят по возрастанию), в одном году — по названию.
  const hoveredCities = useMemo(
    () =>
      (hovered?.cities ?? [])
        .filter((city): city is MapCity & { name: string } => city.name !== undefined)
        .sort(
          (left, right) =>
            left.years[0] - right.years[0] || left.name.localeCompare(right.name, i18n.language),
        ),
    [hovered, i18n.language],
  );

  const wrapClassName = [
    "world-map-wrap",
    isInteractive ? null : "world-map-wrap--static",
    isZoomed ? "world-map-wrap--zoomed" : null,
    isFadedUnderOccluder ? "world-map-wrap--occluded" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={wrapRef}
      className={wrapClassName}
      onMouseEnter={isInteractive ? cacheRect : undefined}
      onMouseMove={isInteractive ? handleMouseMove : undefined}
      onMouseLeave={isInteractive ? () => setHoveredId(null) : undefined}
    >
      {/* Карта всегда заполняет высоту (height:100%/width:auto в CSS), выступ по
          ширине обрезается canvas'ом — верх/низ карты прижаты к padding и не
          зависят от пропорций окна. Тултип лежит вне canvas, чтобы не обрезаться. */}
      <div
        ref={canvasRef}
        className="world-map-canvas"
        style={isFadedUnderOccluder ? ({ "--map-occluded-left": `${occludedLeft}px` } as CSSProperties) : undefined}
      >
        {/* Доступное имя через aria-label, НЕ <title>: <title> браузер рисует как
            нативный tooltip, который налезает на наш кастомный (role="img" тут
            ловит jsx-a11y/prefer-tag-over-role, поэтому просто aria-label). */}
        <svg
          ref={svgRef}
          className="world-map"
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          aria-label={t("map.aria")}
          preserveAspectRatio="xMidYMid meet"
        >
          {countryShapes}
          <g className="world-map__cities">
            {cityDots.map((dot) => (
              <circle
                key={dot.key}
                className="world-map__city-dot"
                cx={dot.cx}
                cy={dot.cy}
                r={cityDotRadius}
                fill={tone.cityDot}
                stroke="#ffffff"
                strokeWidth={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {overlay && <g className="world-map__overlay">{overlay(view)}</g>}
        </svg>
      </div>

      {hoveredId && (
        <div
          ref={tooltipRef}
          className="world-map__tooltip"
          style={{
            left: pointer.x,
            top: pointer.y,
            transform: `translate(${
              flip.x ? `calc(-100% - ${TOOLTIP_OFFSET}px)` : `${TOOLTIP_OFFSET}px`
            }, ${flip.y ? `calc(-100% - ${TOOLTIP_OFFSET}px)` : `${TOOLTIP_OFFSET}px`})`,
          }}
        >
          <span className="world-map__tooltip-title">{hoveredName}</span>
          {hovered?.status === "visited" ? (
            hoveredCities.length > 0 && (
              <ul className="world-map__tooltip-cities">
                {hoveredCities.map((city) => (
                  <li key={city.id}>
                    <span className="world-map__tooltip-city">{city.name}</span>
                    <span className="world-map__tooltip-years">{city.years.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <span className="world-map__tooltip-muted">
              {hovered?.status === "wishlist" ? t("map.wishlist") : t("map.notVisited")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
