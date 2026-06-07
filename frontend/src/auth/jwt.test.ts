import { describe, expect, it } from "vitest";

import { decodeAccessTokenClaims } from "./jwt";

/** Кодирует строку в base64url (как payload-сегмент JWT: `+/` → `-_`, без паддинга). */
function base64Url(value: string): string {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Собирает «токен» `header.<payload>.signature` с произвольным payload (подпись не проверяется). */
function makeToken(payload: Record<string, unknown>): string {
  return `header.${base64Url(JSON.stringify(payload))}.signature`;
}

describe("decodeAccessTokenClaims", () => {
  it("декодирует валидный access-токен в claims", () => {
    const token = makeToken({ sub: "user-1", email_verified: true, exp: 1_700_000_000 });

    expect(decodeAccessTokenClaims(token)).toEqual({
      sub: "user-1",
      email_verified: true,
      exp: 1_700_000_000,
    });
  });

  it("возвращает null для токена не из трёх частей", () => {
    expect(decodeAccessTokenClaims("only.two")).toBeNull();
  });

  it("возвращает null при битом base64 в payload", () => {
    expect(decodeAccessTokenClaims("header.@@@.signature")).toBeNull();
  });

  it("возвращает null, если payload не JSON", () => {
    const token = `header.${base64Url("not json{")}.signature`;

    expect(decodeAccessTokenClaims(token)).toBeNull();
  });

  it("возвращает null при несоответствии схеме (нет email_verified)", () => {
    const token = makeToken({ sub: "user-1", exp: 1_700_000_000 });

    expect(decodeAccessTokenClaims(token)).toBeNull();
  });

  it("возвращает null, если sub не строка", () => {
    const token = makeToken({ sub: 123, email_verified: true, exp: 1_700_000_000 });

    expect(decodeAccessTokenClaims(token)).toBeNull();
  });
});
