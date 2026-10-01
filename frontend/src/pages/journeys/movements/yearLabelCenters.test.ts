import { describe, expect, it } from "vitest";

import { yearLabelCenters } from "./yearLabelCenters";

// Ползунок 300 px; центры подписей держатся не ближе 48 px друг к другу и в 24 px от краёв.
const WIDTH = 300;

describe("yearLabelCenters", () => {
  it("далёкие ручки — подписи ровно под ними", () => {
    expect(yearLabelCenters([60, 220], 1, WIDTH)).toEqual([60, 220]);
  });

  it("правую ручку ведут к левой — левая подпись на месте, правая упирается в неё", () => {
    expect(yearLabelCenters([100, 110], 1, WIDTH)).toEqual([100, 148]);
  });

  it("левую ручку ведут к правой — правая подпись на месте, левая упирается в неё", () => {
    expect(yearLabelCenters([190, 200], 0, WIDTH)).toEqual([152, 200]);
  });

  it("у края подпись прижимается к нему и не выходит за ползунок", () => {
    expect(yearLabelCenters([2, 298], 1, WIDTH)).toEqual([24, 276]);
  });

  it("у края двигаемой подписи уступить некуда — отходит стоящая", () => {
    // Обе ручки у правого края, тянут правую: ей некуда вправо — левая подпись отходит влево.
    expect(yearLabelCenters([290, 296], 1, WIDTH)).toEqual([228, 276]);
    // Обе у левого края, тянут левую: ей некуда влево — правая подпись отходит вправо.
    expect(yearLabelCenters([4, 10], 0, WIDTH)).toEqual([24, 72]);
  });
});
