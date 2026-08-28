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

/**
 * True only for the web-only "landing" pseudo-product build (the bare-root
 * chooser at spendly-share.netlify.app/). Static comparison for the same
 * Metro-inlining reason as ACTIVE_PRODUCT above.
 */
export const IS_LANDING_BUILD: boolean = process.env.EXPO_PUBLIC_PRODUCT === "landing";

/** Path each product is served under on spendly-share.netlify.app. Kept in sync
 * with products/<product>.json's "web.basePath" by lib/activeProduct.test.ts. */
export const WEB_BASE_PATHS: Record<Product, string> = {
  expense: "/expense",
  nutrition: "/nutrition",
  ganesh: "/ganesh",
};

/** The single root route to send an authenticated user to in a single-product build. */
export function activeProductRootRoute(): "/(app)" | "/(nutrition)" | "/(ganesh)" {
  if (ACTIVE_PRODUCT === "nutrition") return "/(nutrition)";
  if (ACTIVE_PRODUCT === "ganesh") return "/(ganesh)";
  return "/(app)";
}

/**
 * Where a not-yet-authenticated user should sign in. Ganesh has its own
 * branded auth screen (phone OTP, Ganesh styling) at /(ganesh-auth)/login —
 * (ganesh)/_layout.tsx's GaneshGate already redirects there internally for
 * an authenticated-but-not-yet-arrived user, but a single-product Ganesh
 * build's welcome screen used to skip straight to the generic /(auth)/login
 * instead, so users only ever saw Expense Tracker's plain sign-in UI.
 * Expense and Nutrition have no dedicated auth screen of their own — both
 * genuinely use the shared /(auth)/login.
 */
export function activeProductEntryRoute(): "/(auth)/login" | "/(ganesh-auth)/login" {
  if (ACTIVE_PRODUCT === "ganesh") return "/(ganesh-auth)/login";
  return "/(auth)/login";
}
