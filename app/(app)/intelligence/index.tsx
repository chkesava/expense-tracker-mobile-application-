import React, { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  Banknote,
  CalendarDays,
  ChevronRight,
  FlaskConical,
  ReceiptText,
  Scale,
  Sparkles,
} from "lucide-react-native";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { haptic } from "@/lib/haptics";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

interface IntelligenceModule {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  route: string;
  icon: typeof Banknote;
  features: string[];
}

const MODULES: IntelligenceModule[] = [
  {
    id: "salary",
    title: "Salary Intelligence",
    subtitle:
      "Detect regular paychecks, monitor net pay stability, break down deductions, and forecast upcoming paydays.",
    tag: "Income",
    route: "/salary",
    icon: Banknote,
    features: ["Payday timeline", "Deductions audit", "Irregularity alerts"],
  },
  {
    id: "decisions",
    title: "Money Decisions",
    subtitle:
      "Journal significant financial choices, compare alternatives side-by-side, and track long-term outcomes.",
    tag: "Decisions",
    route: "/decisions",
    icon: Scale,
    features: ["Decision journal", "Side-by-side compare", "Commitments"],
  },
  {
    id: "fees",
    title: "Fees & Charges",
    subtitle:
      "Surface hidden bank fees, annual credit card charges, transaction penalties, and dispute opportunities.",
    tag: "Cost audit",
    route: "/fees",
    icon: ReceiptText,
    features: ["Automated detection", "Recurring patterns", "Review queue"],
  },
  {
    id: "calendar",
    title: "Financial Calendar",
    subtitle:
      "Forward-looking cash timeline mapping upcoming bills, paydays, debt repayments, and personal reminders.",
    tag: "Timeline",
    route: "/calendar",
    icon: CalendarDays,
    features: ["Month & agenda grid", "Cashflow outlook", "Dues tracking"],
  },
  {
    id: "what-if",
    title: "What-If Simulator",
    subtitle:
      "Stress-test financial scenarios like job changes, new EMIs, major purchases, or spending cuts on your runway.",
    tag: "Simulation",
    route: "/what-if",
    icon: FlaskConical,
    features: ["Sandbox testing", "Runway projection", "Scenario comparison"],
  },
];

/**
 * Intelligence Hub (SPENDLY-334).
 * Consolidates Spendly's 5 core predictive & decision-support modules:
 * Salary Intelligence, Money Decisions, Fees & Charges, Financial Calendar, and What-If Simulator.
 *
 * Adheres strictly to the SPENDLY-406 performance standard:
 * Pure navigation router — leaves underlying listeners dormant until the user navigates into a specific module.
 */
function IntelligenceScreen() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const bottomPadding = usePageListBottomPadding();

  const handleOpenModule = (route: string) => {
    void haptic.navigation();
    router.push(route as Href);
  };

  return (
    <PageShell>
      <PageHeader
        title="Intelligence"
        subtitle="Automated analysis, forward forecasting, and smart financial decisions"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href))}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + theme.space.xl }]}
      >
        {/* Hero Banner */}
        <View
          style={[
            styles.heroBanner,
            {
              backgroundColor: surfaces.wash(theme.colors.primary),
              borderColor: withAlpha(theme.colors.primary, 0.2),
              borderRadius: theme.radius.xl,
              padding: theme.space.lg,
            },
          ]}
        >
          <View style={[styles.heroIconBox, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
            <Sparkles size={22} color={theme.colors.primary} />
          </View>
          <View style={styles.heroTextContainer}>
            <Text
              style={[
                styles.heroTitle,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md },
              ]}
            >
              Smart Decision Engine
            </Text>
            <Text
              style={[
                styles.heroDescription,
                { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs },
              ]}
            >
              Spendly continuously analyzes your ledger to reveal recurring income, hidden costs, upcoming cash
              commitments, and projection models.
            </Text>
          </View>
        </View>

        {/* Modules List */}
        <View style={styles.modulesContainer}>
          {MODULES.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.id}
                onPress={() => handleOpenModule(item.route)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.subtitle}`}
                style={({ pressed }) => [
                  styles.card,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: pressed ? surfaces.tile : theme.colors.card,
                    borderRadius: theme.radius.lg,
                    padding: theme.space.lg,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.iconWrapper, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
                    <Icon size={22} color={theme.colors.primary} />
                  </View>
                  <View style={styles.cardTitleArea}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[
                          styles.cardTitle,
                          {
                            color: theme.colors.foreground,
                            fontFamily: theme.fontFamily.semibold,
                            fontSize: theme.typography.md,
                          },
                        ]}
                      >
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.tagBadge,
                          {
                            backgroundColor: surfaces.wash(theme.colors.primary),
                            borderRadius: theme.radius.full,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tagText,
                            {
                              color: theme.colors.primary,
                              fontFamily: theme.fontFamily.medium,
                              fontSize: 10,
                            },
                          ]}
                        >
                          {item.tag}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.cardSubtitle,
                        {
                          color: theme.colors.mutedForeground,
                          fontFamily: theme.fontFamily.regular,
                          fontSize: theme.typography.xs,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {item.subtitle}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={theme.colors.mutedForeground} style={styles.chevron} />
                </View>

                {/* Micro-Features Row */}
                <View style={[styles.featuresRow, { borderTopColor: surfaces.divider }]}>
                  {item.features.map((feat, fIdx) => (
                    <View key={fIdx} style={styles.featureItem}>
                      <View
                        style={[
                          styles.featureDot,
                          { backgroundColor: withAlpha(theme.colors.mutedForeground, 0.4) },
                        ]}
                      />
                      <Text
                        style={[
                          styles.featureText,
                          {
                            color: theme.colors.mutedForeground,
                            fontFamily: theme.fontFamily.regular,
                            fontSize: 11,
                          },
                        ]}
                      >
                        {feat}
                      </Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </PageShell>
  );
}

export default memo(IntelligenceScreen);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  heroBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    gap: 14,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextContainer: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    lineHeight: 20,
  },
  heroDescription: {
    lineHeight: 16,
  },
  modulesContainer: {
    gap: 12,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleArea: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    lineHeight: 20,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cardSubtitle: {
    lineHeight: 16,
  },
  chevron: {
    marginLeft: 4,
  },
  featuresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  featureText: {
    lineHeight: 14,
  },
});
