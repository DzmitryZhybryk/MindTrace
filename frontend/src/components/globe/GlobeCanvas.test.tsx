import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderWithProviders } from "../../test/render";
import { GlobeCanvas } from "./GlobeCanvas";

/*
 * Ветки этого компонента открываются только когда контейнер получил РАЗМЕР: до этого
 * `<Globe>` не монтируется, ref пуст и эффект настройки камеры выходит на первой строке.
 * Глобальная заглушка ResizeObserver из `src/test/setup.ts` колбэк не дёргает никогда —
 * поэтому здесь своя, с ручным управлением.
 */
let fireResize: ((width: number, height: number) => void) | null = null;

class ControllableResizeObserver {
  // Поле объявлено отдельно, а не parameter property: в проекте включён
  // `erasableSyntaxOnly`, и `constructor(private readonly …)` не проходит tsc.
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    fireResize = (width, height) => {
      this.callback(
        [{ contentRect: { width, height } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    };
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** Инстанс globe.gl, который отдаёт мок вместо настоящего three/WebGL. */
const controls = { autoRotate: false, autoRotateSpeed: 0, enableZoom: true, enablePan: true, enableRotate: true };
const pointOfView = vi.fn();
const pauseAnimation = vi.fn();
const resumeAnimation = vi.fn();
const toGlobeCoords = vi.fn();
// Канвас рендерера нужен интерактивному эффекту (он переопределяет touch-action OrbitControls).
const rendererDomElement = document.createElement("canvas");

vi.mock("react-globe.gl", () => ({
  default: (props: { ref?: { current?: unknown } }) => {
    // globe.gl отдаёт императивный инстанс через ref — воспроизводим ровно это.
    if (props.ref) {
      props.ref.current = {
        controls: () => controls,
        renderer: () => ({ domElement: rendererDomElement }),
        pointOfView,
        pauseAnimation,
        resumeAnimation,
        toGlobeCoords,
      };
    }

    return null;
  },
}));

function setReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  fireResize = null;
  controls.autoRotate = false;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableRotate = true;
  // По умолчанию «мимо сферы»: попадание каждый тест задаёт явно.
  toGlobeCoords.mockReturnValue(null);
  vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
  setReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GlobeCanvas", () => {
  it("не монтирует холст, пока контейнер без размера", () => {
    const { container } = renderWithProviders(<GlobeCanvas />);

    expect(container.querySelector(".globe-canvas")).not.toBeNull();
    expect(pointOfView).not.toHaveBeenCalled();
  });

  it("получив размер, настраивает камеру и глушит зум и пан", () => {
    renderWithProviders(<GlobeCanvas />);

    act(() => fireResize?.(800, 600));

    expect(controls.enableZoom).toBe(false);
    expect(controls.enablePan).toBe(false);
    expect(controls.autoRotate).toBe(true);
    expect(pointOfView).toHaveBeenCalledTimes(1);
  });

  it("первую точку обзора ставит мгновенно, без перелёта", () => {
    renderWithProviders(<GlobeCanvas />);

    act(() => fireResize?.(800, 600));

    // Второй аргумент — длительность: на первой установке она обязана быть нулевой,
    // иначе глобус приезжал бы издалека при каждом открытии страницы.
    expect(pointOfView).toHaveBeenLastCalledWith(expect.anything(), 0);
  });

  it("смену точки обзора проигрывает перелётом", () => {
    const { rerender } = renderWithProviders(<GlobeCanvas pov={{ lat: 0, lng: 0, altitude: 2 }} />);

    act(() => fireResize?.(800, 600));
    act(() => rerender(<GlobeCanvas pov={{ lat: 40, lng: 30, altitude: 1.8 }} />));

    expect(pointOfView).toHaveBeenCalledTimes(2);
    expect(pointOfView).toHaveBeenLastCalledWith(expect.anything(), expect.any(Number));
    expect(pointOfView.mock.calls[1]?.[1]).toBeGreaterThan(0);
  });

  it("при prefers-reduced-motion не вращает и не летает", () => {
    setReducedMotion(true);
    const { rerender } = renderWithProviders(<GlobeCanvas pov={{ lat: 0, lng: 0, altitude: 2 }} />);

    act(() => fireResize?.(800, 600));
    act(() => rerender(<GlobeCanvas pov={{ lat: 40, lng: 30, altitude: 1.8 }} />));

    expect(controls.autoRotate).toBe(false);
    // Даже смена грани идёт мгновенно — перелёт это анимация.
    expect(pointOfView.mock.calls.at(-1)?.[1]).toBe(0);
  });

  it("autoRotate={false} отключает вращение", () => {
    renderWithProviders(<GlobeCanvas autoRotate={false} />);

    act(() => fireResize?.(800, 600));

    expect(controls.autoRotate).toBe(false);
  });

  it("останавливает рендер, когда вкладку скрыли, и возобновляет при возврате", () => {
    renderWithProviders(<GlobeCanvas />);
    act(() => fireResize?.(800, 600));
    // Появление инстанса уже применило play-state (resume для непаузного) — дальше считаем
    // ТОЛЬКО эффект от visibilitychange.
    pauseAnimation.mockClear();
    resumeAnimation.mockClear();

    const setHidden = (hidden: boolean) =>
      Object.defineProperty(document, "hidden", { value: hidden, configurable: true });

    act(() => {
      setHidden(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pauseAnimation).toHaveBeenCalledTimes(1);

    act(() => {
      setHidden(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(resumeAnimation).toHaveBeenCalledTimes(1);
  });

  it("paused ставит на паузу инстанс, появившийся уже спрятанным (прямой заход на /journeys)", () => {
    // На первом рендере ref пуст (нет размера); Globe монтируется лишь после замера. Пауза
    // обязана примениться по факту появления инстанса, иначе rAF скрытого глобуса крутился бы.
    renderWithProviders(<GlobeCanvas paused />);

    act(() => fireResize?.(800, 600));

    expect(pauseAnimation).toHaveBeenCalled();
    expect(resumeAnimation).not.toHaveBeenCalled();
  });

  it("нулевой размер не доводит настройку до конца", () => {
    renderWithProviders(<GlobeCanvas />);

    act(() => fireResize?.(0, 0));

    expect(pointOfView).not.toHaveBeenCalled();
  });

  it("interactive: жест на сфере включает вращение, ставит автовращение на паузу и глушит скролл", () => {
    toGlobeCoords.mockReturnValue({ lat: 10, lng: 20 });
    const { container } = renderWithProviders(<GlobeCanvas interactive />);
    act(() => fireResize?.(800, 600));
    const el = container.querySelector<HTMLElement>(".globe-canvas");
    if (!el) throw new Error("контейнер глобуса не отрендерился");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));

    act(() => {
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(controls.enableRotate).toBe(true);
    expect(controls.autoRotate).toBe(false);

    const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
    act(() => {
      el.dispatchEvent(touchMove);
    });

    expect(touchMove.defaultPrevented).toBe(true);
  });

  it("interactive: жест мимо сферы вращение не включает и скролл не трогает", () => {
    toGlobeCoords.mockReturnValue(null);
    const { container } = renderWithProviders(<GlobeCanvas interactive />);
    act(() => fireResize?.(800, 600));
    const el = container.querySelector<HTMLElement>(".globe-canvas");
    if (!el) throw new Error("контейнер глобуса не отрендерился");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));

    act(() => {
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(controls.enableRotate).toBe(false);
    expect(controls.autoRotate).toBe(true);

    const touchMove = new Event("touchmove", { bubbles: true, cancelable: true });
    act(() => {
      el.dispatchEvent(touchMove);
    });

    expect(touchMove.defaultPrevented).toBe(false);
  });

  it("interactive: отпускание возвращает автовращение с нового места", () => {
    toGlobeCoords.mockReturnValue({ lat: 10, lng: 20 });
    const { container } = renderWithProviders(<GlobeCanvas interactive />);
    act(() => fireResize?.(800, 600));
    const el = container.querySelector<HTMLElement>(".globe-canvas");
    if (!el) throw new Error("контейнер глобуса не отрендерился");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));

    act(() => {
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(controls.autoRotate).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    expect(controls.autoRotate).toBe(true);
  });

  it("interactive: второе касание мимо сферы не обрывает драг и не глушит автовращение", () => {
    // Первый pointerdown попадает в сферу, второй (палец/ладонь мимо шара) — нет.
    toGlobeCoords.mockReturnValueOnce({ lat: 10, lng: 20 });
    const { container } = renderWithProviders(<GlobeCanvas interactive />);
    act(() => fireResize?.(800, 600));
    const el = container.querySelector<HTMLElement>(".globe-canvas");
    if (!el) throw new Error("контейнер глобуса не отрендерился");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));

    act(() => {
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(controls.autoRotate).toBe(false);

    act(() => {
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(controls.enableRotate).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });

    expect(controls.autoRotate).toBe(true);
  });

  it("interactive: наведение показывает grab-курсор над сферой и снимает его мимо неё", () => {
    const { container } = renderWithProviders(<GlobeCanvas interactive />);
    act(() => fireResize?.(800, 600));
    const el = container.querySelector<HTMLElement>(".globe-canvas");
    if (!el) throw new Error("контейнер глобуса не отрендерился");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));

    toGlobeCoords.mockReturnValue({ lat: 10, lng: 20 });
    act(() => {
      el.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    });
    expect(el.style.cursor).toBe("grab");

    toGlobeCoords.mockReturnValue(null);
    act(() => {
      el.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    });
    expect(el.style.cursor).toBe("");
  });

  it("interactive: хит-тест переводит экранные координаты в макетные (scale кадрирования stage)", () => {
    toGlobeCoords.mockReturnValue(null);
    const { container } = renderWithProviders(<GlobeCanvas interactive />);
    act(() => fireResize?.(800, 600));
    const el = container.querySelector<HTMLElement>(".globe-canvas");
    if (!el) throw new Error("контейнер глобуса не отрендерился");
    // Канвас 800×600 отрисован в rect 1600×1200 (scale 2): экранная точка (800, 600) — это (400, 300) макета.
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1600, 1200));

    act(() => {
      el.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 800, clientY: 600 }));
    });

    expect(toGlobeCoords).toHaveBeenCalledWith(400, 300);
  });

  it("без interactive жесты по канвасу не хит-тестятся вовсе", () => {
    const { container } = renderWithProviders(<GlobeCanvas />);
    act(() => fireResize?.(800, 600));
    const el = container.querySelector<HTMLElement>(".globe-canvas");
    if (!el) throw new Error("контейнер глобуса не отрендерился");

    act(() => {
      el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(toGlobeCoords).not.toHaveBeenCalled();
  });
});
