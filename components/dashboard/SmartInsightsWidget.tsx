import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  Lightbulb,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";

import {
  Section,
  toneColor,
  type Tone,
  useSurfaces,
} from "@/components/dashboard/primitives";
import type { Expense } from "@/shared/types/expense";
import {
  buildSmartInsights,
  selectSmartInsights,
  type SmartInsight,
} from "@/shared/utils/smartInsights";
import { useTheme } from "@/theme/ThemeProvider";
import { useSettings } from "@/providers/SettingsProvider";

export interface SmartInsightsWidgetProps {
  expenses: Expense[];
  monthlyBudget?: number;
  currency: string;
  todayKey: string;
}

/** Semantic tone + glyph per insight type. */
function presentation(tone: SmartInsight["tone"]): {
  tone: Tone;
  Icon: typeof AlertTriangle;
  label: string;
} {
  switch (tone) {
    case "warning":
      return { tone: "negative", Icon: AlertTriangle, label: "Needs attention" };
    case "up":
      return { tone: "warning", Icon: TrendingUp, label: "Watch" };
    case "down":
      return { tone: "positive", Icon: TrendingDown, label: "Positive" };
    default:
      return { tone: "muted", Icon: Lightbulb, label: "Watch" };
  }
}

/** The emoji prefixes duplicate the glyph rail, so strip them. */
function stripLeadingEmoji(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+/u, "").trim() || text;
}

export function SmartInsightsWidget({
  expenses,
  monthlyBudget = 0,
  currency,
  todayKey,
}: SmartInsightsWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();

  const insights = useMemo(
    () =>
      buildSmartInsights({
        expenses,
        monthlyBudget,
        currency,
        numberFormat: settings.numberFormat,
        firstDayOfWeek: settings.firstDayOfWeek,
        today: todayKey,
      }),
    [
      expenses,
      monthlyBudget,
      currency,
      settings.numberFormat,
      settings.firstDayOfWeek,
      todayKey,
    ]
  );

  const ordered = useMemo(() => {
    return selectSmartInsights(insights).map((insight) => ({
      insight,
      ...presentation(insight.tone),
    }));
  }, [insights]);

  if (ordered.length === 0) return null;

  return (
    <Section
      title="Smart Insights"
      subtitle="What needs my attention?"
      icon={<Lightbulb size={16} color={theme.colors.warning} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.warning)}
      contentStyle={styles.list}
    >
      {ordered.map(({ insight, tone, Icon, label }) => {
        const color = toneColor(theme.colors, tone);
        return (
          <View key={insight.id} style={styles.row}>
            {/* Semantic rail carries the importance; text stays readable. */}
            <View style={[styles.rail, { backgroundColor: color }]} />
            <Icon size={15} color={color} strokeWidth={2.3} />
            <View style={styles.copy}>
              <Text
                style={[
                  styles.label,
                  { color, fontFamily: theme.fontFamily.semibold },
                ]}
              >
                {label}
              </Text>
              <Text
                style={[
                  styles.text,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.fontFamily.regular,
                  },
                ]}
              >
                {stripLeadingEmoji(insight.text)}
              </Text>
            </View>
          </View>
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  rail: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    minHeight: 18,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  text: {
    fontSize: 13.5,
    lineHeight: 19,
  },
});
