/**
 * Общий шов unit-тестов, стабающих `fetch` напрямую (мимо MSW — см. client.test.ts).
 * Единственная точка правды для сигнатуры стаба и JSON-ответов: до выноса сюда
 * каждый api-сьют держал собственную копию.
 */

export type FetchSignature = (input: string, init?: RequestInit) => Promise<Response>;

/** JSON-ответ с заданным статусом. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 200-ответ с JSON-телом — сокращение для happy-path. */
export function jsonOk(body: unknown): Response {
  return jsonResponse(200, body);
}
