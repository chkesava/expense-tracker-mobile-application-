import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  Lightbulb,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";

import {
  RowGlyph,
  Section,
  toneColor,
  type Tone,
  useSurfaces,
} from "@/components/dashboard/primitives";
import type { Expense } from "@/shared/types/expense";
import {
  buildSmartInsights,
  expensesInInsightWindow,
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

/**
 * Smart Insights (SPENDLY-533): one compact row per insight — a severity glyph,
 * the severity word and the message. Insight rules live in
 * `shared/utils/smartInsights`; this file only presents them.
 */

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

/** The emoji prefixes duplicate the severity glyph, so strip them. */
function stripLeadingEmoji(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+/u, "").trim() || text;
}

export const SmartInsightsWidget = memo(function SmartInsightsWidget({
  expenses,
  monthlyBudget = 0,
  currency,
  todayKey,
}: SmartInsightsWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();

  const insights = useMemo(() => {
    const windowed = expensesInInsightWindow(
      expenses,
      todayKey,
      settings.firstDayOfWeek
    );
    return buildSmartInsights({
      expenses: windowed,
      monthlyBudget,
      currency,
      numberFormat: settings.numberFormat,
      firstDayOfWeek: settings.firstDayOfWeek,
      today: todayKey,
    });
  }, [
    expenses,
    monthlyBudget,
    currency,
    settings.numberFormat,
    settings.firstDayOfWeek,
    todayKey,
  ]);

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
    >
      {ordered.map(({ insight, tone, Icon, label }, index) => {
        const color = toneColor(theme.colors, tone);
        const text = stripLeadingEmoji(insight.text);
        return (
          <View
            key={insight.id}
            style={[
              styles.row,
              index < ordered.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: surfaces.divider,
              },
            ]}
            accessible
            accessibilityLabel={`${label}: ${text}`}
          >
            {/* Glyph + severity word carry the importance; colour only reinforces it. */}
            <RowGlyph size={34} tint={surfaces.wash(color)}>
              <Icon size={15} color={color} strokeWidth={2.3} />
            </RowGlyph>
            <View style={styles.copy}>
              <Text
                style={[styles.label, { color, fontFamily: theme.fontFamily.semibold }]}
                numberOfLines={1}
              >
                {label}
              </Text>
              <Text
                style={[
                  styles.text,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                {text}
              </Text>
            </View>
          </View>
        );
      })}
    </Section>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 1,
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  text: {
    fontSize: 13.5,
    lineHeight: 19,
  },
});
