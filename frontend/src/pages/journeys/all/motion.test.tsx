import { render, renderHook, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { preferReducedMotion } from "../../../test/motion";
import { useAnimatedNumber, useFlip } from "./motion";

// Web Animations в jsdom нет — шпион ставится прямо в прототип и снимается за собой.
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

interface FlipItem {
  id: string;
  top: number;
}

/** Список с `data-flip-id`; место строки в раскладке задаёт `data-top` (в jsdom раскладки нет). */
function FlipList({ items, isPaused }: { items: readonly FlipItem[]; isPaused: boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  useFlip(ref, isPaused);

  return (
    <ul ref={ref}>
      {items.map((item) => (
        <li key={item.id} data-flip-id={item.id} data-top={item.top} />
      ))}
    </ul>
  );
}

/** Раскладка из `data-top` и шпион Web Animations, которого в jsdom нет. */
function stubLayoutAndAnimations() {
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function topOf(this: HTMLElement) {
    return Number(this.dataset.top ?? 0);
  });
  const animate = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate });
  return animate;
}

describe("useAnimatedNumber", () => {
  it("первое значение показывает сразу, а к новому докручивается, а не прыгает", async () => {
    const { result, rerender } = renderHook(({ value }) => useAnimatedNumber(value), { initialProps: { value: 100 } });
    expect(result.current).toBe(100);

    rerender({ value: 300 });

    expect(result.current).toBe(100);
    await waitFor(() => expect(result.current).toBe(300));
  });

  it("при «меньше движения» новое значение показывается сразу", () => {
    preferReducedMotion();
    const { result, rerender } = renderHook(({ value }) => useAnimatedNumber(value), { initialProps: { value: 100 } });

    rerender({ value: 300 });

    expect(result.current).toBe(300);
  });
});

describe("useFlip", () => {
  it("сменившая место строка доезжает со старого места, новая — проявляется, оставшаяся на месте не анимируется", () => {
    const animate = stubLayoutAndAnimations();
    const { rerender, container } = render(
      <FlipList items={[{ id: "a", top: 0 }, { id: "b", top: 50 }]} isPaused={false} />,
    );
    expect(animate).not.toHaveBeenCalled();

    rerender(<FlipList items={[{ id: "b", top: 0 }, { id: "a", top: 50 }, { id: "c", top: 100 }]} isPaused={false} />);

    const animationsByRow = new Map(
      animate.mock.contexts.map((element, index) => [(element as HTMLElement).dataset.flipId, animate.mock.calls[index][0]]),
    );
    expect(animationsByRow.get("b")).toEqual([{ transform: "translateY(50px)" }, { transform: "translateY(0)" }]);
    expect(animationsByRow.get("a")).toEqual([{ transform: "translateY(-50px)" }, { transform: "translateY(0)" }]);
    expect(animationsByRow.get("c")).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(container.querySelectorAll("[data-flip-id]")).toHaveLength(3);
  });

  it("на паузе (идёт перетаскивание) только замеряет: строки не анимируются, а следующий рендер считает от нового места", () => {
    const animate = stubLayoutAndAnimations();
    const { rerender } = render(<FlipList items={[{ id: "a", top: 0 }, { id: "b", top: 50 }]} isPaused={false} />);

    rerender(<FlipList items={[{ id: "b", top: 0 }, { id: "a", top: 50 }]} isPaused />);
    expect(animate).not.toHaveBeenCalled();

    rerender(<FlipList items={[{ id: "b", top: 0 }, { id: "a", top: 50 }]} isPaused={false} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("при «меньше движения» перестановка не анимируется", () => {
    preferReducedMotion();
    const animate = stubLayoutAndAnimations();
    const { rerender } = render(<FlipList items={[{ id: "a", top: 0 }, { id: "b", top: 50 }]} isPaused={false} />);

    rerender(<FlipList items={[{ id: "b", top: 0 }, { id: "a", top: 50 }]} isPaused={false} />);

    expect(animate).not.toHaveBeenCalled();
  });
});
