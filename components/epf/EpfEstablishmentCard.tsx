import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Building2, ListChecks, Pencil } from "lucide-react-native";

import { haptic } from "@/lib/haptics";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import { contributionMonthsFor } from "@/shared/features/epf/utils/contributions";
import {
  deriveEmploymentState,
  maskIdentifier,
} from "@/shared/features/epf/utils";
import { useTheme } from "@/theme/ThemeProvider";

import { withAlpha } from "@/theme/surfaces";
import { Section } from "@/components/dashboard/primitives";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
type Props = {
  establishment: EpfEstablishment;
  todayKey: string;
  onEdit: (establishment: EpfEstablishment) => void;
  /** Opens the contributions screen. Omitted where contributions do not apply. */
  onOpenContributions?: (establishment: EpfEstablishment) => void;
};

const STATE_LABEL: Record<string, string> = {
  current: "Current",
  previous: "Previous",
  upcoming: "Upcoming",
  archived: "Archived",
};

function contributionMonthsLabel(count: number): string {
  return count === 1 ? "1 contribution month" : `${count} contribution months`;
}

export function EpfEstablishmentCard({
  establishment,
  todayKey,
  onEdit,
  onOpenContributions,
}: Props) {
  const { theme } = useTheme();
  const [revealed, setRevealed] = useState(false);

  const state = deriveEmploymentState(establishment, todayKey);
  const isCurrent = state === "current";
  const chipColor = isCurrent ? theme.colors.success : theme.colors.mutedForeground;
  const monthsLabel = contributionMonthsLabel(
    contributionMonthsFor(establishment, todayKey.slice(0, 7)).length
  );
  const { settings } = useSettings();
  const toggleReveal = () => {
    haptic.selection();
    setRevealed((value) => !value);
  };
  const revealLabel = revealed
    ? `Hide identifiers for ${establishment.employerName}, ${monthsLabel}`
    : `Reveal identifiers for ${establishment.employerName}, ${monthsLabel}`;

  return (
    <Section>
      {/* SPENDLY-544: the Edit button used to sit inside the tap-to-reveal
          button (a <button> inside a <button> on web). The reveal target is
          now the identity block and the identifiers; Edit is a sibling. */}
      <View style={styles.header}>
        <Pressable
          onPress={toggleReveal}
          style={styles.headerReveal}
          accessibilityRole="button"
          accessibilityLabel={revealLabel}
        >
          <View style={[styles.iconBadge, { backgroundColor: withAlpha(chipColor, 0.1) }]}>
            <Building2 size={theme.iconSize.md} color={chipColor} />
          </View>

          <View style={styles.headerText}>
            <Text style={[styles.employer, { color: theme.colors.foreground }]} numberOfLines={1}>
              {establishment.employerName}
            </Text>
            <Text style={[styles.dates, { color: theme.colors.mutedForeground }]}>
              {formatDisplayDate(establishment.dateJoined, settings?.dateFormat)} –{" "}
              {establishment.dateLeft
                ? formatDisplayDate(establishment.dateLeft, settings?.dateFormat)
                : "Present"}
            </Text>
          </View>
        </Pressable>

        <View style={styles.headerActions}>
          <View style={[styles.chip, { backgroundColor: withAlpha(chipColor, 0.1) }]}>
            <Text style={[styles.chipText, { color: chipColor }]}>
              {STATE_LABEL[state] ?? state}
            </Text>
          </View>
          <Pressable
            onPress={() => onEdit(establishment)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${establishment.employerName}`}
          >
            <Pencil size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={toggleReveal}
        // The header button above already announces this action.
        accessible={false}
        importantForAccessibility="no"
      >
        <View style={[styles.detailRow, { borderTopColor: theme.colors.border }]}>
          <View style={styles.detailCol}>
            <Text style={[styles.detailLabel, { color: theme.colors.mutedForeground }]}>
              Establishment no.
            </Text>
            <Text style={[styles.detailValue, { color: theme.colors.foreground }]}>
              {revealed
                ? establishment.establishmentNumber
                : maskIdentifier(establishment.establishmentNumber)}
            </Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={[styles.detailLabel, { color: theme.colors.mutedForeground }]}>
              Member ID
            </Text>
            <Text style={[styles.detailValue, { color: theme.colors.foreground }]}>
              {revealed ? establishment.memberId : maskIdentifier(establishment.memberId)}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.duration, { color: theme.colors.mutedForeground }]}
          accessibilityLabel={monthsLabel}
        >
          {monthsLabel}
          {establishment.notes ? ` · ${establishment.notes}` : ""}
        </Text>
      </Pressable>

      {onOpenContributions ? (
        // Outside the tap-to-reveal Pressable above — nesting pressables makes
        // both targets unreliable.
        <Pressable
          onPress={() => onOpenContributions(establishment)}
          style={[styles.contributionsRow, { borderTopColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={`Contributions for ${establishment.employerName}`}
        >
          <ListChecks size={theme.iconSize.sm} color={theme.colors.primary} />
          <Text style={[styles.contributionsText, { color: theme.colors.primary }]}>
            Contributions
          </Text>
        </Pressable>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerReveal: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  employer: {
    fontSize: 15,
    fontWeight: "600",
  },
  dates: {
    fontSize: 12,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailCol: {
    flex: 1,
    gap: 2,
  },
  detailLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  duration: {
    marginTop: 10,
    fontSize: 12,
  },
  contributionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  contributionsText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
