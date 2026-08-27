/**
 * Build-time product selector, mirroring app.config.js / metro.config.js.
 *
 * `null` means "combined" — today's default build with all three products'
 * routes present, matching pre-split behavior exactly. Only an explicit
 * EXPO_PUBLIC_PRODUCT=expense|nutrition|ganesh narrows the build to one
 * product's routes (and, via metro.config.js, excludes the other two
 * products' route files from the bundle). See
 * docs/MULTI_APP_SEPARATION_ANALYSIS.md §11/§14/§22.
 *
 * Written as a static `process.env.EXPO_PUBLIC_PRODUCT` access (per Expo's
 * inlining rules — see lib/env.ts) so this resolves to a literal at build
 * time rather than staying empty in release APKs.
 */
export type Product = "expense" | "nutrition" | "ganesh";

export const ACTIVE_PRODUCT: Product | null =
  process.env.EXPO_PUBLIC_PRODUCT === "expense"
    ? "expense"
    : process.env.EXPO_PUBLIC_PRODUCT === "nutrition"
      ? "nutrition"
      : process.env.EXPO_PUBLIC_PRODUCT === "ganesh"
        ? "ganesh"
        : null;

/** The single root route to send an authenticated user to in a single-product build. */
export function activeProductRootRoute(): "/(app)" | "/(nutrition)" | "/(ganesh)" {
  if (ACTIVE_PRODUCT === "nutrition") return "/(nutrition)";
  if (ACTIVE_PRODUCT === "ganesh") return "/(ganesh)";
  return "/(app)";
}
