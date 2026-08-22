import React, { createContext, useContext, type ReactNode } from "react";
import type { GestureType } from "react-native-gesture-handler";

export type TabSwipeGestureRef = React.MutableRefObject<GestureType | undefined>;

/**
 * Ref of the app-shell horizontal swipe gesture, so horizontally scrollable
 * children can claim the gesture before it reaches the shell.
 */
const TabSwipeContext = createContext<TabSwipeGestureRef | null>(null);

export function TabSwipeGestureProvider({
  gestureRef,
  children,
}: {
  gestureRef: TabSwipeGestureRef;
  children: ReactNode;
}) {
  return (
    <TabSwipeContext.Provider value={gestureRef}>{children}</TabSwipeContext.Provider>
  );
}

/** Null outside the app shell (public web pages, auth stack, tests). */
export function useTabSwipeGestureRef(): TabSwipeGestureRef | null {
  return useContext(TabSwipeContext);
}
