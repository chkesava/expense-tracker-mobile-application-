import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Last child of a bottom-anchored sheet inside React Native's own `Modal`.
 *
 * Under Android edge-to-edge the modal window draws behind the system
 * navigation bar, so a sheet's footer ends up under the 3-button bar. This
 * spacer extends the sheet's own background under the bar and leaves the
 * sheet's existing padding alone. `common/Modal` already handles this; only
 * hand-rolled RN `Modal` sheets need it.
 */
export function SheetBottomInset() {
  const { bottom } = useSafeAreaInsets();
  if (bottom <= 0) return null;
  return <View style={{ height: bottom }} pointerEvents="none" />;
}
