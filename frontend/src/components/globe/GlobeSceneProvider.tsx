import { useMemo, useState, type ReactNode } from "react";

import {
  GlobeSceneActionsContext,
  GlobeSceneContext,
  type GlobeSceneActions,
  type GlobeSlot,
} from "./globeScene";
import type { GlobeRoute } from "./route";

interface GlobeSceneProviderProps {
  children: ReactNode;
}

/**
 * Канал «страница → персистентный глобус». Хост — сиблинг `<Routes>`, поэтому провайдер
 * стоит выше обоих. Модуль лёгкий: ни three, ни текстур — он в main-chunk'е.
 */
export function GlobeSceneProvider({ children }: GlobeSceneProviderProps) {
  const [route, setRoute] = useState<GlobeRoute | null>(null);
  const [slot, setSlot] = useState<GlobeSlot | null>(null);

  const scene = useMemo(() => ({ route, slot }), [route, slot]);
  // Сеттеры useState стабильны — объект живёт всё время жизни провайдера.
  const actions = useMemo<GlobeSceneActions>(() => ({ setRoute, setSlot }), []);

  return (
    <GlobeSceneActionsContext.Provider value={actions}>
      <GlobeSceneContext.Provider value={scene}>{children}</GlobeSceneContext.Provider>
    </GlobeSceneActionsContext.Provider>
  );
}
