/*
 * HTML-метка города для глобуса (точка + название). HTML-слой globe.gl вместо 3D-меток:
 * полный Unicode (диакритика вроде «Reykjavík» рендерится корректно, без «?»), и можно
 * дать text-shadow → ярко и читабельно на пёстрой текстуре. Окклюзию дальней стороны
 * даёт `htmlElementVisibilityModifier` (applyLabelVisibility ниже).
 */

export function createGlobeLabel(name: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "globe-label";

  const dot = document.createElement("span");
  dot.className = "globe-label__dot";

  const label = document.createElement("span");
  label.className = "globe-label__name";
  label.textContent = name;

  wrapper.append(dot, label);
  return wrapper;
}

/** Гасит метку, когда её точка ушла на невидимую (дальнюю) сторону глобуса. */
export function applyLabelVisibility(el: HTMLElement, isVisible: boolean): void {
  el.style.opacity = isVisible ? "1" : "0";
}
