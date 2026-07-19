import { describe, expect, it } from "vitest";

import { applyLabelVisibility, createGlobeLabel } from "./globeLabel";

describe("createGlobeLabel", () => {
  it("собирает обёртку с точкой и названием", () => {
    const label = createGlobeLabel("Reykjavík");

    expect(label.className).toBe("globe-label");
    expect(label.querySelector(".globe-label__dot")).not.toBeNull();
    expect(label.querySelector(".globe-label__name")?.textContent).toBe("Reykjavík");
  });

  it("вставляет название текстом, а не разметкой", () => {
    // Ключевая гарантия: подписи приходят из данных, и HTML-строка вместо textContent
    // сделала бы из них XSS. Проверяем именно это, а не внешний вид.
    const label = createGlobeLabel("<img src=x onerror=alert(1)>");

    expect(label.querySelector("img")).toBeNull();
    expect(label.querySelector(".globe-label__name")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("не падает на пустом названии", () => {
    expect(createGlobeLabel("").querySelector(".globe-label__name")?.textContent).toBe("");
  });
});

describe("applyLabelVisibility", () => {
  it("гасит метку на дальней стороне и возвращает на ближней", () => {
    const label = createGlobeLabel("Lisboa");

    applyLabelVisibility(label, false);
    expect(label.style.opacity).toBe("0");

    applyLabelVisibility(label, true);
    expect(label.style.opacity).toBe("1");
  });
});
