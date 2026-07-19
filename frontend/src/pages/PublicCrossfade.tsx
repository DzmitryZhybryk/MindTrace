import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useOutlet } from "react-router-dom";

import "./public-crossfade.css";

/** Задержка + длительность фейда; должно совпадать с `public-crossfade.css`. */
const FADE_DELAY_MS = 300;
const FADE_DURATION_MS = 550;

interface LeavingScreen {
  pathname: string;
  node: ReactNode;
  /** Скролл на момент ухода — см. `top` в `public-crossfade.css`. */
  scrollY: number;
}

/**
 * Кросс-фейд между экранами публичной зоны: лендинг ↔ signup ↔ login.
 *
 * Экраны публичной зоны — разные РОУТЫ, и React снимает старую страницу в том же
 * кадре, оттого переключение читалось бы рывком. Обёртка держит её
 * смонтированной ещё на длину фейда и гасит поверх входящего: оба фейда идут
 * одновременно и с той же задержкой, что в прототипе.
 *
 * Ключ обёртки — путь, а структура обоих слотов (`div > Suspense > узел`) одинакова:
 * по ключу React узнаёт узел, переехавший из активного слота в уходящий, и
 * переиспользует его вместо перемонтирования. Иначе гасла бы свежая копия страницы —
 * с обнулённой формой и заново отработавшими эффектами монтирования.
 *
 * `Suspense` здесь СВОЙ, а не общий из `App`: дочерние страницы ленивые, и будь
 * единственный Suspense выше `<Routes>`, загрузка чанка соседнего экрана размонтировала
 * бы весь лейаут вместе с глобусом — WebGL пересоздался бы, а камера встала бы на новую
 * грань мгновенно, без перелёта. Отдельная граница на каждый экран нужна по той же
 * причине: подвисший на загрузке входящий экран не должен гасить уходящий.
 */
export function PublicCrossfade() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const [shownPath, setShownPath] = useState(pathname);
  const [leaving, setLeaving] = useState<LeavingScreen | null>(null);
  // Узел ПРЕДЫДУЩЕГО рендера: ref обновляется в эффекте (после коммита), поэтому в
  // момент смены пути здесь ещё лежит уходящий экран — то, что и нужно погасить.
  const previousNodeRef = useRef<ReactNode>(outlet);

  if (shownPath !== pathname) {
    setLeaving({
      pathname: shownPath,
      node: previousNodeRef.current,
      // Скролл читаем здесь, до коммита: после него документ уже сожмётся под входящий
      // экран и браузер обрежет позицию прокрутки — «где был пользователь» будет потеряно.
      scrollY: window.scrollY,
    });
    setShownPath(pathname);
  }

  useEffect(() => {
    previousNodeRef.current = outlet;
  });

  useEffect(() => {
    if (leaving === null) return;

    const timer = window.setTimeout(() => setLeaving(null), FADE_DELAY_MS + FADE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  return (
    <>
      {leaving !== null && (
        <div
          key={leaving.pathname}
          className="public-crossfade__screen public-crossfade__screen--leaving"
          style={{ top: -leaving.scrollY }}
          inert
        >
          <Suspense fallback={null}>{leaving.node}</Suspense>
        </div>
      )}
      <div
        key={pathname}
        className={
          leaving === null
            ? "public-crossfade__screen"
            : "public-crossfade__screen public-crossfade__screen--entering"
        }
      >
        <Suspense fallback={null}>{outlet}</Suspense>
      </div>
    </>
  );
}
