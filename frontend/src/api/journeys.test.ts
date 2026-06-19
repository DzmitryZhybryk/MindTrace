import { describe, expect, it } from "vitest";

import { TRANSPORT_TYPES } from "./journeys";

describe("TransportType-контракт", () => {
  it("публикует ровно backend-набор {land, air, water}", () => {
    // Зеркало backend tests/api/journeys/test_transport_type_contract.py: обе стороны
    // пиннят один литерал. Разъедется домен → один из двух тестов краснеет и напоминает
    // синхронизировать вторую сторону (тут — union + иконки + подписи локалей).
    expect([...TRANSPORT_TYPES].sort()).toEqual(["air", "land", "water"]);
  });
});
