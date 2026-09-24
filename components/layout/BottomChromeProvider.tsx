import { createContext, useContext, type ReactNode } from "react";

import type { BottomNavStyle } from "@/shared/config/bottomChrome";

/**
 * Which bottom chrome the surrounding shell mounts. Spendly's app shell
 * publishes `settings.navigationStyle` here so every clearance calculation
 * below it measures the FAB that is actually on screen (SPENDLY-141).
 *
 * Unset — Nutrition, Ganesh Seva, and any standalone stack — keeps the
 * bottom-nav geometry those products were built against.
 */
const BottomChromeContext = createContext<BottomNavStyle>("bottom");

export function BottomChromeProvider({
  navStyle,
  children,
}: {
  navStyle: BottomNavStyle;
  children: ReactNode;
}) {
  return (
    <BottomChromeContext.Provider value={navStyle}>
      {children}
    </BottomChromeContext.Provider>
  );
}

export function useBottomNavStyle(): BottomNavStyle {
  return useContext(BottomChromeContext);
}
