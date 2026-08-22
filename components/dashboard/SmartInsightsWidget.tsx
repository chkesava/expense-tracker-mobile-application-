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
  priority: number;
} {
  switch (tone) {
    case "warning":
      return { tone: "negative", Icon: AlertTriangle, priority: 0 };
    case "up":
      return { tone: "warning", Icon: TrendingUp, priority: 1 };
    case "down":
      return { tone: "positive", Icon: TrendingDown, priority: 2 };
    default:
      return { tone: "muted", Icon: Lightbulb, priority: 3 };
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

  /** Most important first — warnings above movers above informational. */
  const ordered = useMemo(() => {
    return insights
      .map((insight) => ({ insight, ...presentation(insight.tone) }))
      .sort((a, b) => a.priority - b.priority);
  }, [insights]);

  if (ordered.length === 0) return null;

  return (
    <Section
      title="Smart Insights"
      subtitle="From this week's spending"
      icon={<Lightbulb size={16} color={theme.colors.warning} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.warning)}
      contentStyle={styles.list}
    >
      {ordered.map(({ insight, tone, Icon }) => {
        const color = toneColor(theme.colors, tone);
        return (
          <View key={insight.id} style={styles.row}>
            {/* Semantic rail carries the importance; text stays readable. */}
            <View style={[styles.rail, { backgroundColor: color }]} />
            <Icon size={15} color={color} strokeWidth={2.3} />
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
  text: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
  },
});
