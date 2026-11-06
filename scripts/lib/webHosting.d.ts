// Types for scripts/lib/webHosting.js (plain CommonJS, so build-web.js can require it).

export const PRODUCT_BASE_PATHS: readonly string[];
export const API_FUNCTIONS: readonly string[];
export const CSP: string;
export const SECURITY_HEADERS: readonly (readonly [string, string])[];
export function netlifyRedirects(): string;
export function netlifyHeaders(): string;
export function cloudflareHeaders(): string;
export function cloudflareRoutes(): { version: number; include: string[]; exclude: string[] };
export function isApiPath(pathname: string): boolean;
export function spaIndexFor(pathname: string): string | null;
