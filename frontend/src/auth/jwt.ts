import { z } from "zod";

const accessTokenClaimsSchema = z.object({
  sub: z.string(),
  email_verified: z.boolean(),
  exp: z.number(),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + padding);
}

/**
 * Декодирует payload access-токена БЕЗ верификации подписи.
 *
 * Используется только для UI-логики: показать/скрыть баннер о неподтверждённом email,
 * прочитать `sub`/`exp`. Все security-решения остаются на бэке.
 */
export function decodeAccessTokenClaims(token: string): AccessTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(payloadJson) as unknown;
    const result = accessTokenClaimsSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
