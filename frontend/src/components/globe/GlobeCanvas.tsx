import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import { GLOBE_ATMOSPHERE_COLOR, GLOBE_BUMP_URL, GLOBE_TEXTURE_URL } from "./constants";
import { applyLabelDeclutter, applyLabelVisibility, createGlobeLabel } from "./globeLabel";
import { type LabelBox, resolveLabelVisibility } from "./labelDeclutter";
import type { GlobeRoute, TrailPoint } from "./route";
import {
  applyRouteVisibility,
  createRouteElement,
  isRouteDatum,
  isRouteElement,
  useRouteScene,
  type RouteTrail,
} from "./routeScene";
import type { GlobeCity, RouteArc } from "./routes";
import "./globe-label.css";
import "./globe-canvas.css";

export interface GlobePov {
  lat: number;
  lng: number;
  altitude: number;
}

/*
 * Пропсов ровно столько, сколько кто-то передаёт. Раньше их было семь: `autoRotateSpeed`,
 * `povDurationMs` и `className` не передавал ни один из двух потребителей — они жили как
 * заготовка «на будущее», но читались как поддерживаемая настройка. Вернуть любой из них —
 * две строки, а неиспользуемая опция обязывает её не сломать.
 */
interface GlobeCanvasProps {
  /** Дуги маршрутов (`arcsData`); по умолчанию нет. */
  arcs?: RouteArc[];
  /** Города-концы для подписей (точка + название с окклюзией); по умолчанию нет. */
  labelCities?: GlobeCity[];
  /** Автовращение (гасится при prefers-reduced-motion). */
  autoRotate?: boolean;
  /** Точка обзора камеры. Первая установка мгновенна, смена — плавный перелёт. */
  pov?: GlobePov;
  /** Спрятан роутом (например, `/journeys`) — пауза рендера, чтобы WebGL не крутил вхолостую. */
  paused?: boolean;
  /** Драг-вращение обеими осями. Жест распознаётся пиксельно по самой сфере, мимо неё — уходит странице. */
  interactive?: boolean;
  /** Маршрут формы поездки: пины концов, след и бегущий транспорт; по умолчанию нет. */
  route?: GlobeRoute | null;
  /** Маршрут гаснет (уход с формы поездки на дашборд), затем хост его снимает. */
  routeFading?: boolean;
}

const DEFAULT_POV: GlobePov = { lat: 22, lng: 24, altitude: 2.3 };
/** Минимальный интервал пересчёта деклаттера подписей: fade идёт 0.4s, чаще — только лишние чтения layout. */
const DECLUTTER_INTERVAL_MS = 150;
/** Скорость автовращения и длительность перелёта камеры — общие для всех глобусов. */
const AUTO_ROTATE_SPEED = 0.42;
const POV_FLIGHT_MS = 1400;
const ARC_COLOR: [string, string] = ["rgba(246, 177, 122, 0.95)", "rgba(111, 143, 214, 0.55)"];
// Стабильные пустые ссылки — чтобы дефолты не пересоздавали массивы на каждый рендер.
const EMPTY_ARCS: RouteArc[] = [];
const EMPTY_CITIES: GlobeCity[] = [];

/*
 * Аксессоры — модульные константы, а НЕ стрелки в JSX. globe.gl сравнивает аксессоры по
 * идентичности: новая функция на каждый рендер читается как «правило отрисовки сменилось»,
 * и слой перестраивается целиком. Для `htmlElement` это значит снос и пересборку DOM всех
 * подписей — на ровном месте, просто потому что родитель перерисовался (а он перерисовывается
 * на каждой смене маршрута: `PersistentGlobeHost` сидит на `useLocation`).
 */
const arcColorAccessor = (): [string, string] => ARC_COLOR;
const arcDashInitialGapAccessor = (d: object): number => (d as RouteArc).dashInitialGap;
/*
 * Html-слой в globe.gl один, поэтому подписи городов и элементы маршрута (пины, транспорт)
 * делят его: аксессоры различают датумы по дискриминатору `kind` маршрута.
 */
const htmlLatAccessor = (d: object): number => (d as GlobeCity | { lat: number }).lat;
const htmlLngAccessor = (d: object): number => (d as GlobeCity | { lng: number }).lng;
const htmlAltitudeAccessor = (d: object): number => (isRouteDatum(d) ? d.alt : 0);
const htmlElementAccessor = (d: object): HTMLElement => {
  if (isRouteDatum(d)) {
    return createRouteElement(d);
  }

  const city = d as GlobeCity;
  return createGlobeLabel(city.name, `${city.name}|${city.lat}|${city.lng}`);
};
// Окклюзия дальней стороны: подписи гаснут прозрачностью, маршрут прячется мгновенно (как было).
const htmlVisibilityModifier = (el: HTMLElement, isVisible: boolean): void => {
  if (isRouteElement(el)) {
    applyRouteVisibility(el, isVisible);
    return;
  }

  applyLabelVisibility(el, isVisible);
};
const pathPointsAccessor = (d: object): TrailPoint[] => (d as RouteTrail).coords;
const pathPointLatAccessor = (p: unknown): number => (p as TrailPoint).lat;
const pathPointLngAccessor = (p: unknown): number => (p as TrailPoint).lng;
const pathPointAltAccessor = (p: unknown): number => (p as TrailPoint).alt;
const pathColorAccessor = (d: object): string => (d as RouteTrail).color;

/**
 * Общая база декоративного 3D-глобуса (signature продукта). Инкапсулирует замер
 * контейнера, тёплую тонировку, атмосферу, блок зума скроллом, reduced-motion,
 * автовращение, перелёты камеры (pov) и опциональное драг-вращение по сфере. Опционально рисует дуги маршрутов,
 * подписи городов-концов (HTML-метки с окклюзией дальней стороны) и маршрут формы поездки
 * (пины, след, бегущий транспорт — см. routeScene.ts). Потребитель — app-global глобус-фон
 * (`PersistentGlobeHost`).
 */
export function GlobeCanvas({
  arcs = EMPTY_ARCS,
  labelCities = EMPTY_CITIES,
  autoRotate = true,
  pov = DEFAULT_POV,
  paused = false,
  interactive = false,
  route = null,
  routeFading = false,
}: GlobeCanvasProps) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasSetPovRef = useRef(false);
  // `paused` прошлого коммита: эффект камеры читает его ДО эффекта, который его обновляет.
  const wasPausedRef = useRef(paused);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false),
  );
  const routeScene = useRouteScene({ route, globeRef, containerRef, reducedMotion, fading: routeFading });
  // Без маршрута — та же ссылка `labelCities`: новый массив на рендер пересобирал бы слой.
  const htmlData: object[] =
    routeScene.htmlData.length === 0 ? labelCities : [...labelCities, ...routeScene.htmlData];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || size.width === 0 || size.height === 0) return;

    const controls = globe.controls();
    controls.autoRotate = autoRotate && !reducedMotion;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    controls.enableZoom = false;
    // Пан смещает точку прицела камеры — планета «уезжает» из центра без пути назад.
    controls.enablePan = false;

    // Перелёт — только для смены pov у видимого глобуса. Мгновенно: первая установка, pov,
    // сменившийся пока глобус спрятан (paused), и pov в момент выхода из паузы — иначе
    // проявление глобуса читалось бы влётом камеры с прошлой грани.
    const isInstant = !hasSetPovRef.current || reducedMotion || paused || wasPausedRef.current;
    globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: pov.altitude }, isInstant ? 0 : POV_FLIGHT_MS);
    hasSetPovRef.current = true;
  }, [
    paused,
    size.width,
    size.height,
    reducedMotion,
    autoRotate,
    pov.lat,
    pov.lng,
    pov.altitude,
  ]);

  // Объявлен ПОСЛЕ эффекта камеры: в одном коммите тот успевает прочитать прошлое значение.
  useEffect(() => {
    wasPausedRef.current = paused;
  }, [paused]);

  /*
   * Драг-вращение. Канвас растянут на весь вьюпорт, а планета занимает лишь его середину,
   * поэтому хит-тест — по САМОЙ сфере (raycast через `toGlobeCoords`), а не по прямоугольнику
   * элемента: жест, начатый мимо шара, глобус не трогает и уходит странице (на стеке — нативный
   * скролл). Порядок обработчиков важен: `enableRotate` переключается в capture-фазе
   * pointerdown, ДО обработчика OrbitControls на канвасе, поэтому тот стартует вращение только
   * для жестов на сфере. `touch-action` канваса возвращаем в auto (OrbitControls ставит none —
   * «все касания мои»), а скролл глушим вручную и только пока идёт драг сферы
   * (non-passive touchmove + preventDefault).
   */
  useEffect(() => {
    const el = containerRef.current;
    const globe = globeRef.current;
    if (!interactive || !el || !globe || size.width === 0 || size.height === 0) return;

    const controls = globe.controls();
    const canvasEl = globe.renderer().domElement;
    const prevTouchAction = canvasEl.style.touchAction;
    canvasEl.style.touchAction = "auto";

    let isDraggingSphere = false;

    const hitsSphere = (event: PointerEvent): boolean => {
      // Raycast нормализует точку по МАКЕТНОМУ размеру канваса, а сам канвас живёт внутри
      // трансформированного stage (scale в кадрировании грани) — поэтому экранные координаты
      // переводим в макетные через фактический rect, иначе хит-тест уплывает к краям сферы.
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const x = ((event.clientX - rect.left) * size.width) / rect.width;
      const y = ((event.clientY - rect.top) * size.height) / rect.height;
      return globe.toGlobeCoords(x, y) !== null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      // Мультитач: пока идёт драг, новые указатели игнорируем — иначе второе касание мимо
      // сферы обрывает жест, а endDrag уходит в ранний return и autoRotate застревает выключенным.
      if (isDraggingSphere) return;

      isDraggingSphere = hitsSphere(event);
      controls.enableRotate = isDraggingSphere;

      if (isDraggingSphere) {
        // Пока пользователь держит планету, автовращение не борется с его рукой.
        controls.autoRotate = false;
        el.style.cursor = "grabbing";
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (isDraggingSphere) return;

      el.style.cursor = hitsSphere(event) ? "grab" : "";
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (isDraggingSphere) {
        event.preventDefault();
      }
    };

    const endDrag = () => {
      if (!isDraggingSphere) return;

      isDraggingSphere = false;
      controls.autoRotate = autoRotate && !reducedMotion;
      el.style.cursor = "";
    };

    el.addEventListener("pointerdown", handlePointerDown, { capture: true });
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      canvasEl.style.touchAction = prevTouchAction;
      el.style.cursor = "";
    };
  }, [interactive, autoRotate, reducedMotion, size.width, size.height]);

  /*
   * Деклаттер подписей. У лимба проекция сжимает расстояния, и тексты соседних городов
   * наезжают друг на друга; скрывается только ТЕКСТ проигравшей подписи, точка города
   * видна всегда (resolveLabelVisibility решает, applyLabelDeclutter применяет).
   * Собственный rAF-цикл вместо подписки на OrbitControls: перелёты `pointOfView` двигают
   * камеру мимо controls, а гейт «матрица камеры не менялась — выходим» делает холостой
   * кадр бесплатным. Внутри тика — сперва батч чтений layout, потом батч записи классов.
   */
  useEffect(() => {
    const host = containerRef.current;
    const globe = globeRef.current;
    if (!host || !globe || paused || labelCities.length < 2 || size.width === 0 || size.height === 0) {
      return;
    }

    const camera = globe.camera();
    let previousMatrix: number[] = [];
    let lastRunAt = 0;
    let hiddenIds: ReadonlySet<string> = new Set();
    let rafId = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (now - lastRunAt < DECLUTTER_INTERVAL_MS) return;

      const matrix = camera.matrixWorld.elements;
      if (previousMatrix.length > 0 && matrix.every((value, index) => value === previousMatrix[index])) {
        return;
      }

      previousMatrix = Array.from(matrix);
      lastRunAt = now;

      const hostRect = host.getBoundingClientRect();
      const center = { x: hostRect.left + hostRect.width / 2, y: hostRect.top + hostRect.height / 2 };
      const measured: { wrapper: HTMLElement; box: LabelBox }[] = [];
      for (const wrapper of host.querySelectorAll<HTMLElement>(".globe-label")) {
        // Окклюзия дальней стороны владеет opacity обёртки — спрятанные ею в расчёте не участвуют.
        if (wrapper.style.opacity === "0") continue;

        // Ключ метки — data-атрибут из createGlobeLabel: имя города не уникально.
        const id = wrapper.dataset.labelId;
        const nameEl = wrapper.querySelector<HTMLElement>(".globe-label__name");
        if (!id || !nameEl) continue;

        const rect = nameEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        measured.push({
          wrapper,
          box: { id, left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        });
      }

      hiddenIds = resolveLabelVisibility(
        measured.map((entry) => entry.box),
        center,
        hiddenIds,
      );
      for (const { wrapper, box } of measured) {
        applyLabelDeclutter(wrapper, hiddenIds.has(box.id));
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      // Страховка от застрявшего скрытого текста: эффект мог остановиться (labelCities < 2,
      // pause), а globe.gl — сохранить DOM меток; спрятанной навсегда подпись остаться не должна.
      for (const wrapper of host.querySelectorAll<HTMLElement>(".globe-label--decluttered")) {
        applyLabelDeclutter(wrapper, false);
      }
    };
  }, [labelCities, paused, size.width, size.height]);

  /*
   * Колесо мыши над глобусом раньше глушилось безусловно — и это работало ровно наоборот
   * задуманному. В публичной зоне слушатель мёртв: `.persistent-globe` объявлен
   * `pointer-events: none`, поэтому событие туда не доходит вовсе. А на дашборде и в
   * форме поездки, где глобус интерактивен, `preventDefault` съедал прокрутку СТРАНИЦЫ:
   * пользователь наводил курсор на планету и переставал скроллить экран.
   *
   * Зум скроллом и так выключен через `controls.enableZoom = false` (см. эффект выше) —
   * то есть блокировать было нечего. Слушатель убран: страница прокручивается везде.
   */

  /*
   * WebGL не должен крутиться впустую в двух случаях: вкладка скрыта ИЛИ глобус спрятан
   * роутом (`paused`, например на /journeys, где он за непрозрачной ночью экрана). Сам по себе
   * rAF в фоне тормозится браузером негарантированно (в фоновом окне поверх другого идёт), а
   * сцена анимирована всегда (автовращение + пунктир дуг). Останавливаем явно — заметная
   * разница по батарее и один живой WebGL-контекст на всё приложение.
   */
  useEffect(() => {
    const applyPlayState = () => {
      const globe = globeRef.current;
      if (!globe) return;

      if (paused || document.hidden) {
        globe.pauseAnimation();
      } else {
        globe.resumeAnimation();
      }
    };

    applyPlayState();
    document.addEventListener("visibilitychange", applyPlayState);
    return () => document.removeEventListener("visibilitychange", applyPlayState);
    // size.* в зависимостях НЕ для галочки: `<Globe>` рендерится лишь после первого замера
    // контейнера, поэтому на первом рендере `globeRef` пуст и applyPlayState впустую выходит.
    // Без пере-применения по факту появления инстанса прямой заход на /journeys (там globe
    // спрятан visibility:hidden, но коробка есть → size>0) поднял бы rAF глобуса при paused=true.
  }, [paused, size.width, size.height]);

  return (
    <div ref={containerRef} className={routeFading ? "globe-canvas globe-canvas--route-fading" : "globe-canvas"}>
      {size.width > 0 && size.height > 0 && (
        <Globe
          ref={globeRef}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl={GLOBE_TEXTURE_URL}
          bumpImageUrl={GLOBE_BUMP_URL}
          showAtmosphere
          atmosphereColor={GLOBE_ATMOSPHERE_COLOR}
          atmosphereAltitude={0.24}
          arcsData={arcs}
          arcColor={arcColorAccessor}
          arcAltitudeAutoScale={0.42}
          arcStroke={0.6}
          arcDashLength={0.55}
          arcDashGap={0.35}
          arcDashInitialGap={arcDashInitialGapAccessor}
          arcDashAnimateTime={reducedMotion ? 0 : 3800}
          arcsTransitionDuration={reducedMotion ? 0 : 1200}
          pathsData={routeScene.trails}
          pathPoints={pathPointsAccessor}
          pathPointLat={pathPointLatAccessor}
          pathPointLng={pathPointLngAccessor}
          pathPointAlt={pathPointAltAccessor}
          pathColor={pathColorAccessor}
          pathDashLength={0.05}
          pathDashGap={0.02}
          pathDashAnimateTime={reducedMotion ? 0 : 1600}
          pathTransitionDuration={0}
          htmlElementsData={htmlData}
          htmlLat={htmlLatAccessor}
          htmlLng={htmlLngAccessor}
          htmlAltitude={htmlAltitudeAccessor}
          htmlElement={htmlElementAccessor}
          htmlElementVisibilityModifier={htmlVisibilityModifier}
          // Позиции ставятся сразу: с дефолтной 1000мс твин-анимацией транспорт, чьи координаты
          // меняются каждый кадр, копил бы твины и отставал от головы следа.
          htmlTransitionDuration={0}
        />
      )}
    </div>
  );
}
