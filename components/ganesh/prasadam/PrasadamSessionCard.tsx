import { useMemo } from "react";
import { View } from "react-native";

import {
  GaneshEmptyState,
  MetaLabel,
  Section,
  SectionAction,
  StatusBadge,
  type StatusKind,
} from "@/components/ganesh/ui";
import { PrasadamEntryRow } from "@/components/ganesh/prasadam/PrasadamEntryRow";
import { useSessionTone } from "@/components/ganesh/prasadam/PrasadamSessionTone";
import { Button } from "@/components/ui/Button";
import type {
  PrasadamEntry,
  PrasadamSession,
  PrasadamSessionState,
} from "@/shared/types/ganeshPrasadam";
import {
  entriesForSession,
  prasadamSessionState,
  sortWithinSession,
  summarizePrasadamEntries,
} from "@/shared/utils/ganeshPrasadam";
import { formatSevaDate } from "@/shared/utils/ganeshSeva";

/** Every state carries a word, never colour alone. */
const BADGE: Record<PrasadamSessionState, { kind: StatusKind; label: string }> = {
  "not-started": { kind: "pending", label: "Not started" },
  "in-progress": { kind: "partial", label: "In progress" },
  recorded: { kind: "received", label: "Recorded" },
  cancelled: { kind: "cancelled", label: "Cancelled" },
  missed: { kind: "neutral", label: "Nothing recorded" },
};

/**
 * One session of one day: its status, its running counts, its providers, and
 * the one action that matters.
 *
 * A single `Section` with plain rows inside it — not a card per provider. Every
 * row becoming its own card is what §5 of the UI contract calls out, and a
 * register of twelve offerings would be unreadable that way.
 */
export function PrasadamSessionCard({
  date,
  session,
  entries,
  today,
  canWrite,
  compact = false,
  onAdd,
  onOpenEntry,
  onViewAll,
}: {
  date: string;
  session: PrasadamSession;
  /** The whole register; the card selects its own slice. */
  entries: readonly PrasadamEntry[];
  today: string;
  canWrite: boolean;
  /** Overview renders both sessions side by side in a reduced form. */
  compact?: boolean;
  onAdd?: () => void;
  onOpenEntry?: (id: string) => void;
  onViewAll?: () => void;
}) {
  const tone = useSessionTone(session);

  const forSession = useMemo(
    () => sortWithinSession(entriesForSession(entries, date, session)),
    [entries, date, session]
  );
  const summary = useMemo(
    () => summarizePrasadamEntries(forSession),
    [forSession]
  );
  const state = prasadamSessionState(entries, date, session, today);
  const badge = BADGE[state];

  const counts = [
    `${summary.providerCount} ${summary.providerCount === 1 ? "provider" : "providers"}`,
    `${summary.entryCount} ${summary.entryCount === 1 ? "entry" : "entries"}`,
  ].join(" · ");

  // Per-unit, never one number: "5 kg + 30 pieces" has no single value.
  const quantities = summary.byUnit
    .map((total) => `${total.quantity} ${total.unitLabel ?? total.unit}`)
    .join(" · ");

  const visible = compact ? forSession.slice(0, 3) : forSession;

  return (
    <Section
      title={`${tone.label} Prasadam`}
      subtitle={compact ? tone.window : `${formatSevaDate(date, true)} · ${tone.window}`}
      icon={<tone.Icon size={18} color={tone.accent} strokeWidth={2.2} />}
      iconTint={tone.wash}
      badge={<StatusBadge kind={badge.kind} label={badge.label} />}
      action={
        compact && forSession.length > 3 && onViewAll ? (
          <SectionAction label={`View all ${forSession.length}`} onPress={onViewAll} />
        ) : undefined
      }
    >
      {summary.entryCount > 0 ? <MetaLabel>{counts}</MetaLabel> : null}
      {quantities ? <MetaLabel>{quantities}</MetaLabel> : null}

      {visible.length > 0 ? (
        <View style={{ gap: 2 }}>
          {visible.map((entry) => (
            <PrasadamEntryRow key={entry.id} entry={entry} onPress={onOpenEntry} />
          ))}
        </View>
      ) : (
        <GaneshEmptyState
          compact
          icon={<tone.Icon size={20} color={tone.accent} strokeWidth={2} />}
          title={
            state === "missed"
              ? "Nothing recorded for this session"
              : `No ${tone.label.toLowerCase()} prasadam yet`
          }
          description={
            state === "missed"
              ? "No provider was recorded for this session."
              : `Add the first provider for this ${tone.label.toLowerCase()}.`
          }
          action={
            canWrite && onAdd && state !== "missed"
              ? { label: "Add provider", onPress: onAdd }
              : undefined
          }
        />
      )}

      {!compact && canWrite && onAdd && visible.length > 0 ? (
        <Button onPress={onAdd}>Add provider</Button>
      ) : null}
    </Section>
  );
}
