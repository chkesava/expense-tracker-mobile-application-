import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { UtensilsCrossed } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  GaneshEmptyState,
  GaneshHeader,
  MetaLabel,
  Pill,
  Section,
  SectionAction,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { PrasadamProviderForm } from "@/components/ganesh/prasadam/PrasadamProviderForm";
import { useSessionTone } from "@/components/ganesh/prasadam/PrasadamSessionTone";
import { Button } from "@/components/ui/Button";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { usePrasadamEntry } from "@/hooks/useFestivalPrasadam";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import {
  formatPrasadamQuantity,
  isPrasadamActive,
  prasadamTypeLabel,
} from "@/shared/utils/ganeshPrasadam";
import { formatSevaDate } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One offering: view, correct, cancel.
 *
 * Its own route rather than part of the hub, because a destructive flow does
 * not belong on a surface built for rapid entry — mixing them is how people
 * cancel the wrong row. The register rows and any future notification both need
 * an address to link to, too.
 */
export default function PrasadamEntryScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { can } = useGaneshPermissions();
  const { closed, lockMessage } = useFestivalWriteLock();
  const writes = useGaneshWrites();

  const { entry, loading } = usePrasadamEntry(pandalId, festivalId, id ?? null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const tone = useSessionTone(entry?.session ?? "morning");

  if (!entry) {
    return (
      <GaneshScreen>
        <GaneshHeader
          title="Prasadam"
          icon={<UtensilsCrossed size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        {loading ? null : (
          <GaneshEmptyState
            icon={<UtensilsCrossed size={20} color={g.saffron} strokeWidth={2} />}
            title="This entry is no longer here"
            description="It may have been removed from the register."
            action={{ label: "Back to Prasadam", onPress: back }}
          />
        )}
      </GaneshScreen>
    );
  }

  const active = isPrasadamActive(entry);
  const canEdit = can("prasadam.write") && !closed && active;
  const canCancel = can("prasadam.cancel") && !closed && active;

  const item = entry.prasadamLabel?.trim() || prasadamTypeLabel(entry.prasadamType);
  const quantity = formatPrasadamQuantity(entry.quantity, entry.unit, entry.unitLabel);

  function confirmCancel() {
    if (!entry) return;
    Alert.alert(
      "Cancel this prasadam entry?",
      `${entry.providerName}'s ${item} for ${tone.label.toLowerCase()} on ${formatSevaDate(
        entry.date,
        true
      )} will be marked cancelled. It stays in the day's history so the record is complete.`,
      [
        { text: "Keep entry", style: "cancel" },
        {
          text: "Cancel entry",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            writes
              .cancelPrasadamEntry({
                entryId: entry.id,
                reason: "Cancelled by the committee",
              })
              .catch((error) => {
                logError("ganesh.prasadam.cancel", error);
                toast.error(
                  friendlyErrorMessage(error, "Could not cancel this entry.")
                );
              })
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title={entry.providerName}
        subtitle={`${tone.label} · ${formatSevaDate(entry.date, true)}`}
        icon={<tone.Icon size={22} color={tone.accent} strokeWidth={2.2} />}
        onBack={back}
      />

      {editing ? (
        <PrasadamProviderForm
          mode="edit"
          date={entry.date}
          session={entry.session}
          entries={[]}
          initial={{
            providerName: entry.providerName,
            providerId: entry.providerId,
            providerSource: entry.providerSource,
            mobile: entry.mobile,
            prasadamType: entry.prasadamType,
            prasadamLabel: entry.prasadamLabel,
            quantity: entry.quantity,
            unit: entry.unit,
            unitLabel: entry.unitLabel,
            notes: entry.notes,
          }}
          onSubmit={(draft) =>
            // The day and session are passed back unchanged; the service and
            // the rules both refuse to move them, and the form shows them as
            // fixed pills for the same reason.
            writes.updatePrasadamEntry(entry.id, {
              ...draft,
              date: entry.date,
              session: entry.session,
            })
          }
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <Section
            title="The offering"
            badge={
              active ? undefined : <StatusBadge kind="cancelled" label="Cancelled" />
            }
            action={
              canEdit ? (
                <SectionAction label="Edit" onPress={() => setEditing(true)} />
              ) : undefined
            }
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pill label={tone.label} />
              <Pill label={formatSevaDate(entry.date, true)} tone="muted" />
              <Pill label={prasadamTypeLabel(entry.prasadamType)} tone="muted" />
            </View>
            <Text
              style={{
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
                fontSize: 18,
              }}
            >
              {item} · {quantity}
            </Text>
            {entry.mobile ? <MetaLabel>{entry.mobile}</MetaLabel> : null}
            {entry.notes ? (
              <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
                {entry.notes}
              </Text>
            ) : null}
            <MetaLabel>
              Recorded under {tone.label.toLowerCase()} on{" "}
              {formatSevaDate(entry.date, true)}. To move it, cancel this entry and
              record it again.
            </MetaLabel>
          </Section>

          {!active ? (
            <StatusStrip
              tone="muted"
              message={
                entry.cancelReason
                  ? `Cancelled — ${entry.cancelReason}`
                  : "This entry was cancelled. Record a new entry to correct it."
              }
            />
          ) : null}

          {closed ? <StatusStrip tone="warning" message={lockMessage} /> : null}

          {canCancel ? (
            <Button variant="destructive" loading={busy} onPress={confirmCancel}>
              Cancel this entry
            </Button>
          ) : null}
        </>
      )}
    </GaneshScreen>
  );
}
