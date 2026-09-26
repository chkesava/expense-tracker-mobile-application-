/**
 * Style for expo-navigation-bar's `<NavigationBar style>` under a Spendly theme.
 *
 * SPENDLY-174: the prop names the colour of the bar's *buttons*, like
 * StatusBar's style. The library's type docs say the opposite ("`dark`: a dark
 * navigation bar with light content"), but the native module sets
 * `hasLightBackground = style == "dark"`, and its own `auto` mode maps a light
 * colour scheme to "dark". Following the docs gave dark themes a light grey
 * scrim with dark buttons under the capsule nav.
 *
 * Pure module so lib/navigationBarStyle.test.ts can pin the mapping; re-check
 * it on a device after any expo-navigation-bar upgrade.
 */
export type NavigationBarContentStyle = "light" | "dark";

export function navigationBarStyleFor(isDarkTheme: boolean): NavigationBarContentStyle {
  // Dark theme: light buttons on a dark scrim. Light theme: dark buttons on a light one.
  return isDarkTheme ? "light" : "dark";
}
