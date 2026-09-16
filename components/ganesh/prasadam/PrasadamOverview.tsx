import { useMemo } from "react";
import { Text, View } from "react-native";

import {
  MetaLabel,
  SectionPair,
  StatStrip,
  StatTile,
  StatusStrip,
} from "@/components/ganesh/ui";
import { PrasadamSessionCard } from "@/components/ganesh/prasadam/PrasadamSessionCard";
import type { PrasadamEntry, PrasadamSession } from "@/shared/types/ganeshPrasadam";
import {
  isPrasadamSessionLate,
  summarizePrasadamDay,
} from "@/shared/utils/ganeshPrasadam";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The selected day at a glance.
 *
 * Counts first, then the two sessions side by side from 600dp and stacked below
 * it. No money anywhere — no `Money`, no amount, no rupee glyph — which is what
 * keeps this screen from reading like the Expense Tracker.
 */
export function PrasadamOverview({
  date,
  entries,
  today,
  dayNumber,
  totalDays,
  canWrite,
  onOpenSession,
  onOpenEntry,
}: {
  date: string;
  entries: readonly PrasadamEntry[];
  today: string;
  dayNumber?: number;
  totalDays?: number;
  canWrite: boolean;
  onOpenSession: (session: PrasadamSession) => void;
  onOpenEntry: (id: string) => void;
}) {
  const { theme } = useTheme();
  const summary = useMemo(
    () => summarizePrasadamDay(entries, date, dayNumber),
    [entries, date, dayNumber]
  );

  const sessionsDone =
    (summary.morning.entryCount > 0 ? 1 : 0) + (summary.evening.entryCount > 0 ? 1 : 0);

  const lateSession: PrasadamSession | null = isPrasadamSessionLate(
    entries,
    date,
    "morning",
    today
  )
    ? "morning"
    : isPrasadamSessionLate(entries, date, "evening", today)
      ? "evening"
      : null;

  return (
    <View style={{ gap: 12 }}>
      {dayNumber && totalDays ? (
        <MetaLabel>
          Day {dayNumber} of {totalDays}
        </MetaLabel>
      ) : null}

      <StatStrip>
        <StatTile label="Providers">
          <Value>{summary.providerCount}</Value>
        </StatTile>
        <StatTile label="Entries">
          <Value>{summary.entryCount}</Value>
        </StatTile>
        <StatTile label="Sessions done">
          <Value>
            {sessionsDone}
            <Text style={{ color: theme.colors.mutedForeground }}> / 2</Text>
          </Value>
        </StatTile>
      </StatStrip>

      {lateSession ? (
        <StatusStrip
          tone="warning"
          message={`Nobody is recorded for this ${lateSession} yet.`}
        />
      ) : null}

      <SectionPair>
        <PrasadamSessionCard
          compact
          date={date}
          session="morning"
          entries={entries}
          today={today}
          canWrite={canWrite}
          onAdd={() => onOpenSession("morning")}
          onViewAll={() => onOpenSession("morning")}
          onOpenEntry={onOpenEntry}
        />
        <PrasadamSessionCard
          compact
          date={date}
          session="evening"
          entries={entries}
          today={today}
          canWrite={canWrite}
          onAdd={() => onOpenSession("evening")}
          onViewAll={() => onOpenSession("evening")}
          onOpenEntry={onOpenEntry}
        />
      </SectionPair>
    </View>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.foreground,
        fontFamily: theme.fontFamily.semibold,
        fontSize: 20,
        fontVariant: ["tabular-nums"],
      }}
    >
      {children}
    </Text>
  );
}
