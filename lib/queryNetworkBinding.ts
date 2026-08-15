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
