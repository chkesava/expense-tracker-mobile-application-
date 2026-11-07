/**
 * SPENDLY-703: entry point of the Cloudflare Pages backup's Worker
 * (`_worker.js`, advanced mode). The logic is in router.ts.
 *
 * Only the default export is allowed here: Workers treat every named export of
 * the entry module as another entry point and refuse to start otherwise.
 */
import type { CacheLike } from "./edgeCache";
import { BACKUP_FUNCTIONS, NETLIFY_ONLY_FUNCTIONS } from "./functions";
import { createWorker } from "./router";

export default createWorker({
  loaders: BACKUP_FUNCTIONS,
  netlifyOnly: NETLIFY_ONLY_FUNCTIONS,
  cache: () => (globalThis as { caches?: { default?: CacheLike } }).caches?.default ?? null,
  now: () => Date.now(),
});
