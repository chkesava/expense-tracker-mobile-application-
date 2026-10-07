/**
 * Binds TanStack Query's online/focus managers to React Native.
 *
 * Without this, `onlineManager` looks for browser `online`/`offline` events that
 * never fire on a device, so Query believes it is permanently online: it keeps
 * firing `refetchInterval` polls into a dead radio, burns the retry budget on
 * guaranteed failures, and has no "connection restored" signal to refetch on.
 * `focusManager` has the same problem with `window.focus` — without an AppState
 * binding, a backgrounded app keeps polling and never refetches on resume.
 */

import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AppState, Platform, type AppStateStatus } from "react-native";

let bound = false;

export function bindQueryClientToNetwork(): void {
  if (bound || Platform.OS === "web") return;
  bound = true;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected === true && state.isInternetReachable !== false);
    })
  );

  // SPENDLY-414: this subscribes to every AppState transition, but only the
  // `true` (active) edge triggers TanStack Query's refetch-on-focus — there is
  // no Firestore-backed query in this app today (only useMarketQuotes' market
  // data fetch, gated by its own `staleTime`/`enabled`), so this is currently
  // inert for the app's Firestore read budget. If a Firestore-backed `useQuery`
  // is ever added, give it an explicit `staleTime` so this binding can't cause
  // a read on every foreground.
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        handleFocus(status === "active");
      }
    );
    return () => subscription.remove();
  });
}
