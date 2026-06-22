import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import { CAPITALS, type Capital } from "../data/capitals";
import { GLOBE_ATMOSPHERE_COLOR, GLOBE_BUMP_URL, GLOBE_TEXTURE_URL } from "./globe/constants";
import { centralAngleRad, toDeg } from "./globe/geo";
import "./auth-globe.css";

// Столицы выбираются среди тех, что в пределах этого угла от точки наведения камеры.
// За время жизни метки (4с) глобус повернётся на ~10° (autoRotateSpeed=0.4 → ~2.4°/с),
// так что 55° даёт запас, чтобы метка не уехала за горизонт до окончания fade-out.
const VISIBILITY_ANGLE_DEG = 55;
const CAPITAL_LIFETIME_MS = 4000;
const CAPITAL_INTERVAL_MS = 3000;

type ActiveCapital = { id: number; capital: Capital };

function createCapitalElement(d: object): HTMLElement {
  const item = d as ActiveCapital;
  const wrapper = document.createElement("div");
  wrapper.className = "capital-label";

  const dot = document.createElement("span");
  dot.className = "capital-dot";

  const name = document.createElement("span");
  name.className = "capital-name";
  name.textContent = item.capital.name;

  wrapper.appendChild(dot);
  wrapper.appendChild(name);
  return wrapper;
}

export function AuthGlobe() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [activeCapitals, setActiveCapitals] = useState<ActiveCapital[]>([]);
  const [hasSize, setHasSize] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize({ width, height });
      // Латч «глобус получил размер» — однократно гейтит спавн столиц. Ставим в
      // callback'е наблюдателя (не в теле эффекта); повторные вызовы с тем же
      // значением React дедупит.
      if (width > 0 && height > 0) {
        setHasSize(true);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    if (size.width === 0 || size.height === 0) return;

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = false;

    globe.pointOfView({ lat: 25, lng: 20, altitude: 2.4 }, 0);
  }, [size.width, size.height]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Блокируем колесо/тачпад-пинч на контейнере: глобус не должен зумиться скроллом.
    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    el.addEventListener("wheel", blockWheel, { passive: false });
    return () => el.removeEventListener("wheel", blockWheel);
  }, []);

  // Спавн столиц: каждые 4с добавляем новую (5с лайфтайм с CSS fade-in/hold/fade-out),
  // чтобы fade-out предыдущей и fade-in следующей перекрывались на 1с.
  useEffect(() => {
    if (!hasSize) return;
    const globe = globeRef.current;
    if (!globe) return;

    let nextId = 0;
    const removalTimers = new Set<number>();

    const spawn = () => {
      const view = globe.pointOfView();
      const candidates = CAPITALS.filter(
        (c) => toDeg(centralAngleRad(view.lat, view.lng, c.lat, c.lng)) <= VISIBILITY_ANGLE_DEG,
      );
      if (candidates.length === 0) return;

      const capital = candidates[Math.floor(Math.random() * candidates.length)];
      const id = ++nextId;
      const entry: ActiveCapital = { id, capital };

      setActiveCapitals((prev) => [...prev, entry]);

      const timer = window.setTimeout(() => {
        setActiveCapitals((prev) => prev.filter((c) => c.id !== id));
        removalTimers.delete(timer);
      }, CAPITAL_LIFETIME_MS);
      removalTimers.add(timer);
    };

    spawn();
    const interval = window.setInterval(spawn, CAPITAL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      removalTimers.forEach((t) => window.clearTimeout(t));
    };
  }, [hasSize]);

  return (
    <div
      ref={containerRef}
      className="auth-globe"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--globe-bg)",
        touchAction: "none",
      }}
    >
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
          atmosphereAltitude={0.22}
          htmlElementsData={activeCapitals as unknown as object[]}
          htmlLat={(d: object) => (d as ActiveCapital).capital.lat}
          htmlLng={(d: object) => (d as ActiveCapital).capital.lng}
          htmlAltitude={0.01}
          htmlElement={createCapitalElement}
        />
      )}
    </div>
  );
}
