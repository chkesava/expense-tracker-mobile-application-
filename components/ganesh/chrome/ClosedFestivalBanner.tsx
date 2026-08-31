import { View } from "react-native";

import { StatusStrip } from "@/components/ganesh/ui";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { CLOSED_FESTIVAL_VIEW_MESSAGE } from "@/shared/utils/ganeshFestivalStatus";

export function ClosedFestivalBanner() {
  const { closed } = useFestivalWriteLock();
  if (!closed) return null;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
      <StatusStrip tone="warning" message={CLOSED_FESTIVAL_VIEW_MESSAGE} />
    </View>
  );
}
