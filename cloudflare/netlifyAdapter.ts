/**
 * SPENDLY-703: runs the existing Netlify function handlers on Cloudflare
 * unchanged. A Request becomes the Netlify v1 `event` they read (method,
 * lowercased headers, query, body) and their `{ statusCode, headers, body }`
 * becomes a Response.
 */

export type NetlifyEvent = {
  httpMethod: string;
  path: string;
  rawUrl: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string>;
  body: string | null;
  isBase64Encoded: false;
};

export type NetlifyResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
};

/** Every function module exports `handler`. Method syntax: each handler declares its own narrower event type. */
export type NetlifyHandlerModule = {
  handler(event: NetlifyEvent): Promise<NetlifyResult>;
};

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const BODYLESS_STATUSES = new Set([101, 204, 205, 304]);

export async function toNetlifyEvent(request: Request, omitHeaders: readonly string[] = []): Promise<NetlifyEvent> {
  const url = new URL(request.url);
  const omit = new Set(omitHeaders.map((name) => name.toLowerCase()));
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    const key = name.toLowerCase();
    if (!omit.has(key)) headers[key] = value;
  });
  // Netlify v1 keeps the last value of a repeated query parameter.
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((value, name) => {
    queryStringParameters[name] = value;
  });
  return {
    httpMethod: request.method.toUpperCase(),
    path: url.pathname,
    rawUrl: request.url,
    headers,
    queryStringParameters,
    body: BODYLESS_METHODS.has(request.method.toUpperCase()) ? null : await request.text(),
    isBase64Encoded: false,
  };
}

function decodeBase64(body: string): ArrayBuffer {
  const binary = atob(body);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

export function toResponse(result: NetlifyResult): Response {
  const headers = new Headers(result.headers ?? {});
  const empty = BODYLESS_STATUSES.has(result.statusCode) || result.body === undefined || result.body === "";
  const body = empty ? null : result.isBase64Encoded ? decodeBase64(result.body!) : result.body!;
  return new Response(body, { status: result.statusCode, headers });
}
