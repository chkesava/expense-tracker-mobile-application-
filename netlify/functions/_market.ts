/**
 * Shared plumbing for the market quote functions (stock, mutual-funds, crypto).
 * Not an entrypoint: esbuild inlines it into each bundle (scripts/bundle-netlify-fns.js).
 */

export type NetlifyEvent = {
  httpMethod?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

export type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  // Quotes are public and identical for every caller; a minute of CDN cache
  // keeps a portfolio refresh from fanning out to the upstream provider.
  "Cache-Control": "public, max-age=60",
};

const FETCH_TIMEOUT_MS = 15_000;

export function json(statusCode: number, payload: unknown): NetlifyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

export function fail(statusCode: number, message: string): NetlifyResult {
  return json(statusCode, { success: false, message });
}

export function query(event: NetlifyEvent, key: string): string | undefined {
  const value = event.queryStringParameters?.[key];
  return typeof value === "string" ? value : undefined;
}

export function isTimeout(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

/** GET with a timeout and one retry on a transport failure (not on an HTTP error). */
export async function upstreamGet(url: string, attempt = 1): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Spendly)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (attempt < 2) return upstreamGet(url, attempt + 1);
    throw error;
  }
}
