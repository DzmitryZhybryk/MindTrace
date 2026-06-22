import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import { GLOBE_ATMOSPHERE_COLOR, GLOBE_BUMP_URL, GLOBE_TEXTURE_URL } from "./globe/constants";
import "./home-globe.css";

/**
 * Декоративный глобус-герой главной: тонированный под палитру (--globe-tint),
 * авто-вращающийся, без подписей — спокойный якорь экрана и единый signature с
 * глобусами auth/add. Дуги реальных поездок и кадрирование камеры по ним появятся,
 * когда на фронт подключат journeys-данные (сейчас Home — на мок-данных).
 */
export function HomeGlobe() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Глобус рисуем только после ненулевого замера контейнера (как в Auth/Journey-глобусах).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || size.width === 0 || size.height === 0) return;

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = false;
    globe.pointOfView({ lat: 25, lng: 20, altitude: 2.4 }, 0);
  }, [size.width, size.height]);

  // Декоративный глобус не должен зумиться скроллом — гасим колесо/пинч на контейнере.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const blockWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", blockWheel, { passive: false });
    return () => el.removeEventListener("wheel", blockWheel);
  }, []);

  return (
    <div ref={containerRef} className="home-globe">
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
        />
      )}
    </div>
  );
}
