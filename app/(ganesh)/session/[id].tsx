import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Wallet } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  DataRow,
  GaneshEmptyState,
  GaneshHeader,
  ListStateView,
  MetaLabel,
  Money,
  Section,
  StatStrip,
  StatTile,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  useCollectionSessions,
  useReconciliationAdjustments,
  useReconciliations,
} from "@/hooks/useCollectionSessions";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { formatGaneshWhen } from "@/shared/utils/ganeshIdentity";
import { describeDifference } from "@/shared/utils/ganeshReconciliation";
import {
  reconciliationStatusKind,
  reconciliationStatusLabel,
  sessionNextStep,
  sessionStatusKind,
  sessionStatusLabel,
} from "@/shared/utils/ganeshSessionDisplay";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One session, its cash count, and whatever is still outstanding
 * (GS-076, GS-075).
 *
 * The three figures — expected, counted, difference — are rendered together and
 * unconditionally once a count exists. The instruction on this feature was "do
 * not hide discrepancies", and a difference that only appears when it is
 * non-zero is a difference the reader has to already suspect to look for.
 */
export default function CollectionSessionScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { realUser } = useAuth();
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const { sessions, loading } = useCollectionSessions(pandalId, festivalId);
  const { reconciliations } = useReconciliations(pandalId, festivalId);
  const { adjustments } = useReconciliationAdjustments(pandalId, festivalId, id ?? null);

  const session = sessions.find((row) => row.id === id);
  const reconciliation = useMemo(
    () => reconciliations.find((row) => row.sessionId === id) ?? null,
    [reconciliations, id]
  );

  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!can("sessions.read")) {
    return <GaneshWriteLock message="Your role cannot view collection sessions." />;
  }

  if (!session) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader title="Session" onBack={back} />
        {loading ? (
          <ListStateView loading title="Loading the session" skeletonCount={3} />
        ) : (
          <GaneshEmptyState
            icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
            title="Session not found"
            description="It may belong to another festival."
          />
        )}
      </GaneshScreen>
    );
  }

  const isCollector = session.collectorId === realUser?.uid;
  const isCounter = reconciliation?.countedBy === realUser?.uid;

  // Every one of these mirrors a rule the server enforces. They exist so the
  // action is absent rather than offered-and-refused (GS-035).
  const canCount =
    can("reconciliation.count") &&
    !isCollector &&
    session.status !== "open" &&
    session.status !== "cancelled" &&
    (!reconciliation || (!reconciliation.locked && reconciliation.status === "counted"));
  const canApprove =
    can("reconciliation.approve") &&
    reconciliation?.status === "counted" &&
    !reconciliation.locked &&
    !isCounter &&
    !isCollector;
  const canResolve =
    can("reconciliation.resolve") && reconciliation?.status === "mismatch";

  const next = sessionNextStep(session, reconciliation);

  const submitCount = () => {
    const amount = Number(counted);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter the counted cash as 0 or more.");
      return;
    }
    setBusy(true);
    writes
      .recordCashCount(session.id, { countedCash: amount, reason: reason.trim() || undefined })
      .then(() => {
        setCounted("");
        setReason("");
      })
      .catch((error) => {
        logError("ganesh.recordCashCount", error);
        toast.error(friendlyErrorMessage(error, "Could not record the count."));
      })
      .finally(() => setBusy(false));
  };

  const approve = () => {
    Alert.alert(
      "Approve this count?",
      reconciliation && reconciliation.difference !== 0
        ? `You are approving a count that is off by ${formatInr(Math.abs(reconciliation.difference))}. The difference stays on the record.`
        : "You are confirming the cash matches the recorded collections. This cannot be edited afterwards.",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Approve",
          onPress: () => {
            setBusy(true);
            writes
              .approveCashCount(session.id, { reason: reason.trim() || undefined })
              .catch((error) => {
                logError("ganesh.approveCashCount", error);
                toast.error(friendlyErrorMessage(error, "Could not approve the count."));
              })
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  };

  const resolve = () => {
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error("Enter the adjustment amount.");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("Record why this difference is being resolved.");
      return;
    }
    setBusy(true);
    writes
      .resolveReconciliation(session.id, { amount, reason: adjustReason.trim() })
      .then(() => {
        setAdjustAmount("");
        setAdjustReason("");
      })
      .catch((error) => {
        logError("ganesh.resolveReconciliation", error);
        toast.error(friendlyErrorMessage(error, "Could not resolve the difference."));
      })
      .finally(() => setBusy(false));
  };

  return (
    <GaneshScreen>
      <GaneshHeader
        title={session.collectorName}
        subtitle={`Collection session · ${session.date}`}
        icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <View style={styles.badgeRow}>
        <StatusBadge
          kind={sessionStatusKind(session.status)}
          label={sessionStatusLabel(session.status)}
        />
        {reconciliation ? (
          <StatusBadge
            kind={reconciliationStatusKind(reconciliation.status)}
            label={reconciliationStatusLabel(reconciliation.status)}
          />
        ) : null}
      </View>

      {next ? <StatusStrip tone="warning" message={next} /> : null}

      <Section title="What this session collected" subtitle="Frozen when the collector closed it">
        <StatStrip>
          <StatTile label="Cash">
            <Money value={session.expectedCash} size="secondary" />
          </StatTile>
          <StatTile label="UPI / bank">
            <Money value={session.expectedNonCash} size="secondary" />
          </StatTile>
          <StatTile label="Total">
            <Money value={session.totalCollected} size="secondary" />
          </StatTile>
          <StatTile label="Collections">
            <Text style={[styles.count, { color: theme.colors.foreground }]}>
              {session.collectionCount}
            </Text>
          </StatTile>
        </StatStrip>
        {session.declaredCash != null ? (
          <MetaLabel>
            {session.collectorName} declared {formatInr(session.declaredCash)} at handover.
          </MetaLabel>
        ) : null}
        {/* The override, surfaced rather than buried — a session someone else
            closed should say so on its face (GS-076). */}
        {session.closedOnBehalfOf ? (
          <StatusStrip
            tone="muted"
            message={`Closed by ${session.closedByName ?? "an admin"} on the collector's behalf${
              session.closeReason ? `: ${session.closeReason}` : "."
            }`}
          />
        ) : null}
      </Section>

      {reconciliation ? (
        <Section
          title="Cash count"
          subtitle={describeDifference(reconciliation.difference)}
        >
          {/* All three, always, in this order. */}
          <StatStrip>
            <StatTile label="Expected">
              <Money value={reconciliation.expectedCash} size="secondary" />
            </StatTile>
            <StatTile label="Counted">
              <Money value={reconciliation.countedCash} size="secondary" />
            </StatTile>
            <StatTile label="Difference">
              <Money
                value={reconciliation.difference}
                size="secondary"
                tone={reconciliation.difference === 0 ? "positive" : "warning"}
              />
            </StatTile>
          </StatStrip>
          <MetaLabel>
            Counted by {reconciliation.countedByName}
            {reconciliation.countedAt ? ` · ${formatGaneshWhen(reconciliation.countedAt)}` : ""}
          </MetaLabel>
          {reconciliation.approvedByName ? (
            <MetaLabel>
              Approved by {reconciliation.approvedByName}
              {reconciliation.approvedAt ? ` · ${formatGaneshWhen(reconciliation.approvedAt)}` : ""}
            </MetaLabel>
          ) : null}
          {reconciliation.reason ? <MetaLabel>Reason: {reconciliation.reason}</MetaLabel> : null}
        </Section>
      ) : null}

      {canCount ? (
        <Section
          title={reconciliation ? "Count again" : "Count the cash"}
          subtitle={
            reconciliation
              ? "Nobody has approved yet, so a miscount can still be corrected by counting again."
              : `Count the physical cash ${session.collectorName} handed over.`
          }
        >
          <Input
            label="Counted cash"
            value={counted}
            onChangeText={setCounted}
            keyboardType="numeric"
          />
          <Input
            label="Reason (required if it does not match)"
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <Button loading={busy} onPress={submitCount}>
            Record the count
          </Button>
        </Section>
      ) : null}

      {/* Said out loud rather than by an absent button, so the second person
          knows they are the one being waited for. */}
      {reconciliation?.status === "counted" && isCounter ? (
        <StatusStrip
          tone="muted"
          message="You counted this. Someone else with approval authority has to sign it off."
        />
      ) : null}

      {canApprove ? (
        <Section title="Approve the count" subtitle="You are the second person on this cash.">
          <Button loading={busy} onPress={approve}>
            Approve
          </Button>
        </Section>
      ) : null}

      {canResolve ? (
        <Section
          title="Resolve the difference"
          subtitle="This records a correction. It does not change any collection."
        >
          <Input
            label="Adjustment amount"
            value={adjustAmount}
            onChangeText={setAdjustAmount}
            keyboardType="numeric"
          />
          <Input
            label="Why"
            value={adjustReason}
            onChangeText={setAdjustReason}
            multiline
          />
          <Button loading={busy} onPress={resolve}>
            Record adjustment
          </Button>
        </Section>
      ) : null}

      {adjustments.length > 0 ? (
        <Section title="Adjustments" subtitle="Corrections recorded against this count">
          {adjustments.map((row, index) => (
            <DataRow
              key={row.id}
              title={`${row.direction === "out" ? "-" : "+"}${formatInr(row.amount)}`}
              meta={row.reason}
              divider={index < adjustments.length - 1}
            />
          ))}
        </Section>
      ) : null}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  count: { fontSize: 20, fontWeight: "700" },
});
