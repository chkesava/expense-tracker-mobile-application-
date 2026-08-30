/**
 * Static Ganesh Seva splash colors.
 *
 * Kept as module constants (no theme hook) so the overlay can paint before
 * AppThemeProvider has resolved the user's theme.
 */
export const GANESH_SPLASH_MAROON = "#3D1224";

export const GANESH_SPLASH = {
  maroon: GANESH_SPLASH_MAROON,
  maroonDeep: "#2A0C18",
  gold: "#E0B84F",
  goldSoft: "rgba(224, 184, 79, 0.32)",
  goldFaint: "rgba(224, 184, 79, 0.14)",
  ivory: "#F6EDE2",
  saffron: "#E28A3C",
  petal: "rgba(226, 138, 60, 0.5)",
} as const;

/** Hold the festival reveal long enough to play, and to warm Pandal data. */
export const GANESH_SPLASH_MIN_MS = 5500;
export const GANESH_SPLASH_REDUCED_MIN_MS = 1600;
export const GANESH_SPLASH_FADE_MS = 420;
