import { ErrorBoundary } from "../components/ErrorBoundary";
import { PublicHeader } from "../components/PublicHeader";
import { PersistentGlobe } from "../components/globe/PersistentGlobe";
import { PublicCrossfade } from "./PublicCrossfade";
import "./public-layout.css";

// Тёмная база на месте глобуса, если WebGL/three упали: публичная зона рассчитана на
// тёмный фон, без неё контент лёг бы на белое. Форма логина от сбоя WebGL не страдает.
const globeFallback = <div className="public-layout__globe-fallback" />;

/**
 * Каркас публичной зоны («Уровень 3»): персистентный глобус-фон + общая шапка +
 * контент через `<Outlet/>`. Глобус и шапка смонтированы здесь один раз, поэтому при
 * навигации между дочерними роутами (лендинг, login, signup) они не перезагружаются —
 * камера лишь перелетает к грани текущего экрана.
 *
 * Глобус под локальным `ErrorBoundary`: сбой WebGL не должен ронять auth-формы, это
 * критический путь входа в продукт.
 *
 * Контент идёт через `PublicCrossfade`, а не напрямую через `<Outlet/>`: он держит
 * уходящий экран смонтированным на время фейда и несёт собственный `Suspense`, чтобы
 * загрузка чанка соседней страницы не размонтировала лейаут вместе с глобусом.
 */
export function PublicLayout() {
  return (
    <div className="public-layout">
      <ErrorBoundary fallback={globeFallback}>
        <PersistentGlobe />
      </ErrorBoundary>
      <PublicHeader />
      {/* Ландмарк `main`: у публичной зоны его не было вовсе, и скринридер не мог
          перепрыгнуть шапку к содержимому. Обёртка одна на все три экрана, поэтому
          во время кросс-фейда двух `main` в документе не возникает. */}
      <main className="public-layout__content">
        <PublicCrossfade />
      </main>
    </div>
  );
}
