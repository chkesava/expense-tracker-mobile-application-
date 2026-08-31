import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Flame } from "lucide-react-native";

import { FestivalDateStrip } from "@/components/ganesh/art/FestivalDateStrip";
import { FestivalHero } from "@/components/ganesh/chrome/FestivalHero";
import { GaneshIconTile } from "@/components/ganesh/ui/GaneshIconTile";

/**
 * Seva tab identity. Shared maroon chrome; dates stay live.
 */
export function SevaHero({
  festivalName,
  festival,
  today,
  onFestivalDates,
  rightAccessory,
}: {
  festivalName?: string;
  festival?: { startDate?: string; endDate?: string; name?: string } | null;
  today?: string;
  onFestivalDates?: () => void;
  rightAccessory?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <FestivalHero
        title="Seva"
        subtitle={festivalName}
        rightAccessory={rightAccessory}
        showFestivalSwitcher
        mark={
          <GaneshIconTile onDark>
            <Flame size={22} color="#FFF8F1" strokeWidth={2} />
          </GaneshIconTile>
        }
      />
      <FestivalDateStrip festival={festival} today={today} onPress={onFestivalDates} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 4,
  },
});
