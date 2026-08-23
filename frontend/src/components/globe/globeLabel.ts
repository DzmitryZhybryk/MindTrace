/*
 * HTML-метка города для глобуса (точка + название). HTML-слой globe.gl вместо 3D-меток:
 * полный Unicode (диакритика вроде «Reykjavík» рендерится корректно, без «?»), и можно
 * дать text-shadow → ярко и читабельно на пёстрой текстуре. Окклюзию дальней стороны
 * даёт `htmlElementVisibilityModifier` (applyLabelVisibility ниже).
 */

export function createGlobeLabel(name: string, id: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "globe-label";
  // Стабильный ключ метки для деклаттера: имя не уникально (одноимённые города легитимны),
  // ключ включает координаты — textContent остаётся чисто отображением.
  wrapper.dataset.labelId = id;
  // Старт с нуля: `applyLabelVisibility` тут же выставит 1 для видимых меток, и CSS-transition
  // (globe-label.css) плавно проявит их. Так реальные города пользователя ПРОЯВЛЯЮТСЯ (fade-in)
  // при входе на /home, а не выскакивают резко поверх курируемых. Проявление зависит от активного
  // рендер-цикла (модификатор зовётся globe.gl'ом): единственный экран с паузой (/journeys) там же
  // и скрыт, так что «застрявших на 0» меток не бывает — но появись «на паузе, но видимый» экран,
  // метки нужно будет проявлять иначе.
  wrapper.style.opacity = "0";

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

/**
 * Прячет/показывает ТОЛЬКО текст подписи — точка города остаётся видимой всегда.
 * Канал деклаттера коллизий (класс на обёртке, CSS гасит `__name`); не пересекается
 * с окклюзией выше, которая владеет inline-opacity самой обёртки.
 */
export function applyLabelDeclutter(wrapper: HTMLElement, isHidden: boolean): void {
  wrapper.classList.toggle("globe-label--decluttered", isHidden);
}
