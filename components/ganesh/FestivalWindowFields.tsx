import { StyleSheet, View } from "react-native";

import { MetaLabel } from "@/components/ganesh/ui";
import { Input } from "@/components/ui/Input";

/**
 * Optional first/last day of a festival, as ISO `yyyy-mm-dd`.
 *
 * These dates drive “Day 4 of 10” on the Command Center and the Seva day
 * strip. They are never inferred from the year — a committee types them.
 */
export function FestivalWindowFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  editable = true,
}: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  editable?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.field}>
          <Input
            label="First day"
            value={startDate}
            onChangeText={onStartDateChange}
            placeholder="2026-08-27"
            editable={editable}
          />
        </View>
        <View style={styles.field}>
          <Input
            label="Last day"
            value={endDate}
            onChangeText={onEndDateChange}
            placeholder="2026-09-05"
            editable={editable}
          />
        </View>
      </View>
      <MetaLabel numberOfLines={2}>
        YYYY-MM-DD. Optional — used for “Day 4 of 10” and the Seva day strip.
      </MetaLabel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  field: {
    flex: 1,
  },
});
