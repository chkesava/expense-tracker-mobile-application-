import type { NetlifyHandlerModule } from "./netlifyAdapter";

/**
 * SPENDLY-703, decision D5 (docs/SPENDLY-621-compatibility.md): the backup runs
 * only the Netlify functions that work on Cloudflare unchanged. Every function
 * in scripts/bundle-netlify-fns.js must be in exactly one of the two lists;
 * cloudflare/functions.test.ts fails otherwise, so a new function can't be
 * left out by accident.
 *
 * Each handler is imported on its first request, so a module that fails to
 * load breaks only its own route.
 */
export const BACKUP_FUNCTIONS: Record<string, () => Promise<NetlifyHandlerModule>> = {
  stock: () => import("../netlify/functions/stock"),
  "mutual-funds": () => import("../netlify/functions/mutual-funds"),
  crypto: () => import("../netlify/functions/crypto"),
  "stock-history": () => import("../netlify/functions/stock-history"),
  "market-overview": () => import("../netlify/functions/market-overview"),
  "stock-quotes": () => import("../netlify/functions/stock-quotes"),
  "nutrition-ai": () => import("../netlify/functions/nutrition-ai"),
  "readmodel-claims": () => import("../netlify/functions/readmodel-claims"),
};

/** Served by Netlify only. The reason is for the docs and the logs; users see one generic message. */
export const NETLIFY_ONLY_FUNCTIONS: Record<string, string> = {
  "ganesh-summary": "uses Firestore Admin, which can't run on Workers",
  "ganesh-draw": "uses Firestore Admin, which can't run on Workers",
  "epf-cron": "uses Firestore Admin, which can't run on Workers",
  "delete-account": "uses Firestore Admin, which can't run on Workers",
  "readmodel-push": "uses Firestore Admin, which can't run on Workers; the nightly sync catches up",
  "screener-universe": "needs about 200 ms of CPU per call, over the Free plan's 10 ms",
};
