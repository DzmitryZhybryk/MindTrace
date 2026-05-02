import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import { CITIES, type City } from "./data";
import "./sandbox.css";

const GLOBE_TEXTURE_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
const GLOBE_BUMP_URL = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";

function createCityElement(d: object): HTMLElement {
  const city = d as City;

  const wrapper = document.createElement("div");
  wrapper.className = "city-label";

  const dot = document.createElement("span");
  dot.className = "city-dot";

  const name = document.createElement("span");
  name.className = "city-name";
  name.textContent = city.name;

  wrapper.appendChild(dot);
  wrapper.appendChild(name);
  return wrapper;
}

export function SandboxPage() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = false;

    globe.pointOfView({ lat: 25, lng: 20, altitude: 2.4 }, 0);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Блокируем колесо/тачпад-пинч на контейнере: ctrlKey-wheel — это macOS pinch (page-zoom),
    // обычный wheel — потенциальный dolly OrbitControls. Глобус управляется только мышью (drag).
    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    el.addEventListener("wheel", blockWheel, { passive: false });
    return () => el.removeEventListener("wheel", blockWheel);
  }, []);

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "radial-gradient(ellipse at center, #0a1230 0%, #02040a 60%, #000 100%)",
        touchAction: "none",
      }}
    >
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={GLOBE_TEXTURE_URL}
        bumpImageUrl={GLOBE_BUMP_URL}
        showAtmosphere
        atmosphereColor="#4ab3ff"
        atmosphereAltitude={0.22}
        htmlElementsData={CITIES as unknown as object[]}
        htmlLat={(d: object) => (d as City).lat}
        htmlLng={(d: object) => (d as City).lng}
        htmlAltitude={0.01}
        htmlElement={createCityElement}
      />
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 20,
          color: "#cfe6ff",
          font: "500 13px/1.4 system-ui,sans-serif",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: 0.7,
          pointerEvents: "none",
        }}
      >
        sandbox · globe
      </div>
    </div>
  );
}
