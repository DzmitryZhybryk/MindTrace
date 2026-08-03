/*
 * Канон-данные глобуса: кураторские наборы городов и маршруты между ними. Дуги рисуются
 * между `from`/`to`, подписываются ТОЛЬКО города-концы (`ROUTE_CITIES`).
 *
 * Правило рисунка: по 2 города на континент, и дуга НИКОГДА не соединяет два города
 * одного континента. Отсюда любой перелёт межконтинентальный, дуги перекрывают друг
 * друга и рисунок читается как живой хаос, а не как аккуратный обход по периметру.
 *
 * Каркас набора — ОТКРЫТЫЕ цепи, не замкнутые кольца: у поездки есть начало и конец.
 * Замыкание дало бы всем степень 2, а граф со степенью 2 в каждой вершине — это всегда
 * цикл, который и читается кольцевым обходом.
 *
 * Континент-инвариант каркаса обеспечен КОНСТРУКЦИЕЙ, а не дисциплиной: каждая цепь
 * берёт ровно по одному городу с каждого континента, поэтому соседи заведомо с разных
 * континентов. Поверх каркаса добавлены ручные ПЕРЕМЫЧКИ между цепями — они дают
 * города-хабы (степень 3) и сшивают две ленты так, что глаз больше не раскладывает
 * рисунок на две отдельные нитки. Итоговая степень города — от 1 (конец цепи) до 3.
 *
 * Набор выбирается случайно ОДИН раз за загрузку модуля, поэтому он стабилен при
 * навигации (персистентный глобус живёт между роутами) и меняется только на обновлении
 * страницы. Подряд один и тот же набор не выпадает.
 */

import { CITIES, type City } from "./cities";

export type { City, GlobeCity } from "./cities";

export interface RouteArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** Начальная фаза бегущего пунктира, [0,1). Общая у синхронной группы дуг. */
  dashInitialGap: number;
}

interface Route {
  readonly from: City;
  readonly to: City;
}

export interface RouteSet {
  /** Каркас: цепи по одному городу с каждого континента. Порядок и есть рисунок. */
  readonly chains: readonly (readonly City[])[];
  /**
   * Ручные дуги поверх каркаса. Гарантия конструкции на них НЕ распространяется, поэтому
   * континенты пары выписаны в комментарии — проверяется глазами по строке. Все идут
   * МЕЖДУ цепями: перемычка внутри одной цепи замкнула бы соседей в треугольник.
   */
  readonly bridges: readonly Route[];
}

/*
 * Наборы подобраны вручную по одним и тем же правилам. При подборе порядка в цепи важно
 * держать дуги короче ~110° по центральному углу: длиннее — дуга раздувается по высоте и
 * уходит за сферу. Третью дугу не заводить в один город, если две другие уже сходятся
 * рядом: такой пучок читается кляксой.
 */
export const ROUTE_SETS: readonly RouteSet[] = [
  {
    chains: [
      [CITIES.reykjavik, CITIES.newYork, CITIES.cusco, CITIES.capeTown, CITIES.delhi, CITIES.sydney],
      [CITIES.tokyo, CITIES.honolulu, CITIES.vancouver, CITIES.rio, CITIES.marrakesh, CITIES.istanbul],
    ],
    bridges: [
      { from: CITIES.tokyo, to: CITIES.sydney }, // Азия → Океания, западная Пацифика
      { from: CITIES.newYork, to: CITIES.marrakesh }, // С. Америка → Африка, через Атлантику
      { from: CITIES.istanbul, to: CITIES.delhi }, // Европа → Азия
    ],
  },
  {
    chains: [
      [CITIES.stockholm, CITIES.cairo, CITIES.shanghai, CITIES.auckland, CITIES.buenosAires, CITIES.mexicoCity],
      [CITIES.sanFrancisco, CITIES.papeete, CITIES.bogota, CITIES.lisbon, CITIES.nairobi, CITIES.dubai],
    ],
    bridges: [
      { from: CITIES.dubai, to: CITIES.cairo }, // Азия → Африка
      { from: CITIES.mexicoCity, to: CITIES.lisbon }, // С. Америка → Европа, через Атлантику
      { from: CITIES.shanghai, to: CITIES.sanFrancisco }, // Азия → С. Америка, северная Пацифика
    ],
  },
  {
    chains: [
      [CITIES.perth, CITIES.kathmandu, CITIES.dublin, CITIES.dakar, CITIES.quito, CITIES.chicago],
      [CITIES.rome, CITIES.zanzibar, CITIES.singapore, CITIES.suva, CITIES.santiago, CITIES.havana],
    ],
    bridges: [
      { from: CITIES.rome, to: CITIES.chicago }, // Европа → С. Америка
      { from: CITIES.singapore, to: CITIES.perth }, // Азия → Океания
      { from: CITIES.havana, to: CITIES.dakar }, // С. Америка → Африка, через Атлантику
    ],
  },
  {
    chains: [
      [CITIES.edinburgh, CITIES.lagos, CITIES.saoPaulo, CITIES.montreal, CITIES.honolulu, CITIES.seoul],
      [CITIES.samarkand, CITIES.athens, CITIES.antananarivo, CITIES.wellington, CITIES.ushuaia, CITIES.losAngeles],
    ],
    bridges: [
      { from: CITIES.seoul, to: CITIES.losAngeles }, // Азия → С. Америка, северная Пацифика
      { from: CITIES.athens, to: CITIES.lagos }, // Европа → Африка
      { from: CITIES.saoPaulo, to: CITIES.antananarivo }, // Ю. Америка → Африка, южная Атлантика
    ],
  },
  {
    chains: [
      [CITIES.helsinki, CITIES.tunis, CITIES.bangkok, CITIES.brisbane, CITIES.lima, CITIES.anchorage],
      [CITIES.vladivostok, CITIES.apia, CITIES.miami, CITIES.rio, CITIES.maputo, CITIES.barcelona],
    ],
    bridges: [
      { from: CITIES.barcelona, to: CITIES.bangkok }, // Европа → Азия
      { from: CITIES.anchorage, to: CITIES.vladivostok }, // С. Америка → Азия, северная Пацифика
      { from: CITIES.helsinki, to: CITIES.miami }, // Европа → С. Америка, через Атлантику
    ],
  },
];

/** Дуги набора: цепи (город i → город i+1, без замыкания) плюс перемычки. */
export function routesOf(routeSet: RouteSet): readonly Route[] {
  return [
    ...routeSet.chains.flatMap((chain) =>
      chain.slice(0, -1).map((from, index) => ({ from, to: chain[index + 1] })),
    ),
    ...routeSet.bridges,
  ];
}

/*
 * Фаза бегущего пунктира принадлежит не дуге, а ГРУППЕ синхронных дуг. В одну группу
 * попадают дуги с общим городом отправления (вылетают вместе) и дуги с общим городом
 * прибытия (приходят вместе) — у равных фаз пунктир идёт по нормализованной длине
 * одинаково, поэтому одно и то же равенство даёт и синхронный вылет, и синхронный приход.
 *
 * Равенство транзитивно, так что группы — классы эквивалентности, и считает их union-find,
 * а не ручной список: дуга вроде `NY→Marrakesh` сшивает вылеты из Нью-Йорка с приходами в
 * Марракеш в один класс. Добавишь дугу — группы пересоберутся сами. Между группами фазы
 * разнесены равномерно, иначе глобус пульсировал бы в такт.
 */
function synchronizedPhases(routes: readonly Route[]): number[] {
  const parent = routes.map((_, index) => index);

  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }

    return root;
  };

  const union = (a: number, b: number): void => {
    parent[find(b)] = find(a);
  };

  const firstDepartureFrom = new Map<City, number>();
  const firstArrivalTo = new Map<City, number>();
  routes.forEach((route, index) => {
    const sameDeparture = firstDepartureFrom.get(route.from);
    if (sameDeparture === undefined) {
      firstDepartureFrom.set(route.from, index);
    } else {
      union(sameDeparture, index);
    }

    const sameArrival = firstArrivalTo.get(route.to);
    if (sameArrival === undefined) {
      firstArrivalTo.set(route.to, index);
    } else {
      union(sameArrival, index);
    }
  });

  const groups = routes.map((_, index) => find(index));
  const distinct = Array.from(new Set(groups));

  return groups.map((group) => distinct.indexOf(group) / distinct.length);
}

const LAST_SET_STORAGE_KEY = "myjourney.globe.route-set";

function readLastPickedIndex(): number | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(LAST_SET_STORAGE_KEY);
    return raw === null ? null : Number.parseInt(raw, 10);
  } catch {
    // Приватный режим Safari запрещает доступ к storage — тогда просто не помним прошлый.
    return null;
  }
}

function rememberPickedIndex(index: number): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(LAST_SET_STORAGE_KEY, String(index));
  } catch {
    // Запись недоступна — единственное следствие: набор может повториться подряд.
    return;
  }
}

/**
 * Случайный набор, отличный от показанного в прошлую загрузку. Прошлый индекс лежит в
 * sessionStorage: он живёт ровно столько, сколько вкладка, что и совпадает с ощущением
 * «обновил страницу — увидел другой мир».
 */
function pickRouteSet(): RouteSet {
  const previous = readLastPickedIndex();
  const allIndexes = ROUTE_SETS.map((_, index) => index);
  const candidates = allIndexes.filter((index) => index !== previous);
  const pool = candidates.length > 0 ? candidates : allIndexes;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  rememberPickedIndex(picked);
  return ROUTE_SETS[picked];
}

const ROUTES: readonly Route[] = routesOf(pickRouteSet());
const DASH_PHASES: readonly number[] = synchronizedPhases(ROUTES);

/** Дуги для `arcsData` globe.gl. */
export const ROUTE_ARCS: RouteArc[] = ROUTES.map((route, index) => ({
  startLat: route.from.lat,
  startLng: route.from.lng,
  endLat: route.to.lat,
  endLng: route.to.lng,
  dashInitialGap: DASH_PHASES[index],
}));

/** Уникальные города-концы маршрутов — их подписываем на глобусе. */
export const ROUTE_CITIES: City[] = Array.from(
  new Map(
    ROUTES.flatMap((route) => [
      [route.from.name, route.from],
      [route.to.name, route.to],
    ]),
  ).values(),
);
