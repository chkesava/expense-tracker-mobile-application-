import { Pressable, Text, View } from "react-native";

import type { PermanentFundLocation } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const LOCATIONS: PermanentFundLocation[] = ["cash", "upi", "bank", "other"];

export function fundLocationLabel(location: PermanentFundLocation): string {
  if (location === "upi") return "UPI";
  return location.charAt(0).toUpperCase() + location.slice(1);
}

export function FundLocationChips({
  value,
  onChange,
}: {
  value: PermanentFundLocation;
  onChange: (next: PermanentFundLocation) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {LOCATIONS.map((location) => {
        const selected = value === location;
        return (
          <Pressable
            key={location}
            onPress={() => onChange(location)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: selected ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: selected ? theme.colors.primaryForeground : theme.colors.foreground,
                fontWeight: "700",
              }}
            >
              {fundLocationLabel(location)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
