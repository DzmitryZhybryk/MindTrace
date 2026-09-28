import { createContext, useContext } from "react";

import type { GlobeRoute } from "./route";

/**
 * Прямоугольник места под глобус на странице (viewport-координаты `getBoundingClientRect`).
 * По нему хост кадрирует и обрезает сферу.
 */
export interface GlobeSlot {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Что страница просит показать на своей грани глобуса. Читает хост. */
export interface GlobeSceneState {
  route: GlobeRoute | null;
  slot: GlobeSlot | null;
}

/**
 * Сеттеры сцены — отдельным контекстом со стабильной ссылкой: страница-публикатор не
 * перерисовывается на каждом тике замера слота, её дерево (форма) живёт своей жизнью.
 */
export interface GlobeSceneActions {
  setRoute: (route: GlobeRoute | null) => void;
  setSlot: (slot: GlobeSlot | null) => void;
}

export const GlobeSceneContext = createContext<GlobeSceneState | null>(null);
export const GlobeSceneActionsContext = createContext<GlobeSceneActions | null>(null);

export function useGlobeScene(): GlobeSceneState {
  const ctx = useContext(GlobeSceneContext);
  if (ctx === null) {
    throw new Error("useGlobeScene must be used within a <GlobeSceneProvider>");
  }

  return ctx;
}

export function useGlobeSceneActions(): GlobeSceneActions {
  const ctx = useContext(GlobeSceneActionsContext);
  if (ctx === null) {
    throw new Error("useGlobeSceneActions must be used within a <GlobeSceneProvider>");
  }

  return ctx;
}
