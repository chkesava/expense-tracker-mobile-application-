import { Text, type StyleProp, type TextStyle } from "react-native";

import { toneColor, type Tone } from "@/components/dashboard/primitives";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The Ganesh money type scale.
 *
 * Ganesh screens show several amounts per row (total, God Fund share, personal
 * share, pending reimbursement), so amounts need a hierarchy of their own and
 * tabular figures so columns line up down a list.
 */
export type MoneySize = "hero" | "title" | "primary" | "secondary" | "meta";

const SIZES: Record<MoneySize, { fontSize: number; lineHeight: number; weight: "bold" | "semibold" | "medium"; tracking: number }> = {
  hero: { fontSize: 34, lineHeight: 40, weight: "bold", tracking: -1 },
  title: { fontSize: 22, lineHeight: 28, weight: "bold", tracking: -0.5 },
  primary: { fontSize: 17, lineHeight: 22, weight: "semibold", tracking: -0.2 },
  secondary: { fontSize: 14, lineHeight: 19, weight: "medium", tracking: 0 },
  meta: { fontSize: 12, lineHeight: 16, weight: "medium", tracking: 0 },
};

export type MoneyProps = {
  value: number;
  size?: MoneySize;
  /** Semantic tone. Defaults to `default` — amounts are foreground, not accent. */
  tone?: Tone;
  /** Prefix the value with an explicit sign. */
  signed?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
};

export function Money({
  value,
  size = "primary",
  tone = "default",
  signed = false,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
}: MoneyProps) {
  const { theme } = useTheme();
  const spec = SIZES[size];
  const sign = signed && value > 0 ? "+" : "";

  return (
    <Text
      accessibilityLabel={`${sign}${formatInr(value)}`}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={adjustsFontSizeToFit ? 0.8 : undefined}
      style={[
        {
          color: toneColor(theme.colors, tone),
          fontSize: spec.fontSize,
          lineHeight: spec.lineHeight,
          letterSpacing: spec.tracking,
          fontFamily: theme.fontFamily[spec.weight],
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    >
      {sign}
      {formatInr(value)}
    </Text>
  );
}
