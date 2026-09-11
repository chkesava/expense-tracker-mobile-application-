import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Building2, ListChecks, Pencil } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { haptic } from "@/lib/haptics";
import type { EpfEstablishment } from "@/shared/features/epf/types";
import {
  deriveEmploymentState,
  establishmentDurationMonths,
  maskIdentifier,
} from "@/shared/features/epf/utils";
import { useTheme } from "@/theme/ThemeProvider";

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

function formatDuration(months: number): string {
  if (months < 1) return "Less than a month";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? "s" : ""}`);
  if (rest > 0) parts.push(`${rest} mo${rest > 1 ? "s" : ""}`);
  return parts.join(" ");
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
  const duration = establishmentDurationMonths(establishment, todayKey);

  return (
    <Card>
      <Pressable
        onPress={() => {
          haptic.selection();
          setRevealed((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          revealed
            ? `Hide identifiers for ${establishment.employerName}`
            : `Reveal identifiers for ${establishment.employerName}`
        }
      >
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: chipColor + "1A" }]}>
            <Building2 size={theme.iconSize.md} color={chipColor} />
          </View>

          <View style={styles.headerText}>
            <Text style={[styles.employer, { color: theme.colors.foreground }]} numberOfLines={1}>
              {establishment.employerName}
            </Text>
            <Text style={[styles.dates, { color: theme.colors.mutedForeground }]}>
              {establishment.dateJoined} – {establishment.dateLeft ?? "Present"}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <View style={[styles.chip, { backgroundColor: chipColor + "1A" }]}>
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

        <Text style={[styles.duration, { color: theme.colors.mutedForeground }]}>
          {formatDuration(duration)}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
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
