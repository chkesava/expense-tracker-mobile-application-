import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Landmark, PackageCheck } from "lucide-react-native";

import { Input } from "@/components/ui/Input";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import {
  DataRow,
  FilterChips,
  FormShell,
  FundHero,
  Money,
  Section,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useFestivalMembers } from "@/hooks/useFestivalMembers";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSummary } from "@/hooks/useGaneshSummary";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { PermanentFundLocation } from "@/shared/types/ganesh";
import { availableGodFund, validateSettlement } from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const LOCATION_OPTIONS: Array<{ id: PermanentFundLocation; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function CloseFestivalScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { isOnline } = useNetwork();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { members } = useFestivalMembers(pandalId, festivalId);
  const { fund } = usePermanentFund(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const canTransfer = can("permanentFund.transfer");
  const festival = festivals.find((item) => item.id === festivalId);
  const closing = availableGodFund(summary);

  const [transferText, setTransferText] = useState("0");
  const [location, setLocation] = useState<PermanentFundLocation>("cash");
  const [busy, setBusy] = useState(false);

  const transfer = Number(transferText || 0);
  const remaining = useMemo(
    () => Math.round((closing - (Number.isFinite(transfer) ? transfer : 0)) * 100) / 100,
    [closing, transfer]
  );

  const confirm = () => {
    const transferAmount = canTransfer && Number.isFinite(transfer) ? transfer : 0;
    const remainingAmount = Math.round((closing - transferAmount) * 100) / 100;
    const settlement = validateSettlement({
      closing,
      transfer: transferAmount,
      remaining: remainingAmount,
    });
    if (!settlement.ok) {
      toast.error(settlement.error);
      return;
    }
    setBusy(true);
    writes
      .closeFestival({
        transferAmount,
        remainingAmount,
        location,
        festivalName: festival?.name,
      })
      .then(() => back())
      .catch((error) => {
        logError("ganesh.closeFestival", error);
        toast.error(friendlyErrorMessage(error, "Could not close the festival."));
      })
      .finally(() => setBusy(false));
  };

  if (!can("festival.close")) {
    return <GaneshWriteLock message="Only a Pandal Admin or Treasurer can close this festival." />;
  }

  const deficit = closing < 0;
  const offlineBlocked = !isOnline && transfer > 0;

  return (
    <FormShell
      title="Close festival"
      subtitle={festival?.name}
      icon={<PackageCheck size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Confirm settlement and close"
      submitting={busy}
      submitDisabled={deficit || offlineBlocked}
      onSubmit={confirm}
      footerHint={
        deficit ? (
          <StatusStrip
            tone="negative"
            message={`This festival is short ${formatInr(
              Math.abs(closing)
            )}. Transfer that much from the Permanent Fund first — closing with a deficit is not a settlement.`}
          />
        ) : offlineBlocked ? (
          <StatusStrip
            tone="warning"
            message="Transferring to the Permanent Fund needs an active connection."
          />
        ) : (
          <StatusStrip
            tone="info"
            message="Nothing moves until you confirm. This is a fund transfer, not a donation or an expense."
          />
        )
      }
    >
      <FundHero
        eyebrow="Closing cash"
        amount={closing}
        kind="god"
        breakdown={[
          { label: "To Permanent Fund", value: Number.isFinite(transfer) ? transfer : 0 },
          { label: "Stays in festival", value: Number.isFinite(remaining) ? remaining : 0 },
        ]}
      />

      <Section title="Where the closing balance came from">
        <DataRow
          title="Opening funds"
          divider
          value={<Money value={summary.openingFunds} size="secondary" />}
        />
        <DataRow
          title="Household chanda"
          divider
          value={<Money value={summary.chanda} size="secondary" />}
        />
        <DataRow
          title="Committee contributions"
          divider
          value={<Money value={summary.committeeContributions} size="secondary" />}
        />
        <DataRow
          title="Other cash"
          divider
          value={<Money value={summary.otherCashContributions} size="secondary" />}
        />
        <DataRow
          title="God Fund expenses"
          divider
          value={<Money value={summary.godFundExpenses} size="secondary" />}
        />
        <DataRow
          title="Reimbursements paid"
          divider
          value={<Money value={summary.reimbursements} size="secondary" />}
        />
        <DataRow title="Closing cash" value={<Money value={closing} size="primary" />} />
      </Section>

      {summary.pendingReimbursements > 0 ? (
        <Section title="Before you close">
          <View style={styles.statRow}>
            <StatTile label="Still owed to members">
              <Money
                value={summary.pendingReimbursements}
                size="primary"
                tone="warning"
                numberOfLines={1}
                adjustsFontSizeToFit
              />
            </StatTile>
            <StatTile label="Committee people">
              <Text
                style={[
                  styles.count,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                ]}
              >
                {members.length}
              </Text>
            </StatTile>
          </View>
          <StatusStrip
            tone="warning"
            message="Members are still waiting to be paid back. Consider reimbursing them before closing."
          />
        </Section>
      ) : null}

      <Section
        title="Move unused cash to the Permanent Fund"
        subtitle={`Transfer plus remaining must equal ${formatInr(
          closing
        )}. Enter ${formatInr(closing)} to move everything, or 0 to leave it in this festival.`}
      >
        <View style={styles.form}>
          <PermanentFundCard fund={fund} />

          {canTransfer ? (
            <>
              <Input
                label="Transfer to Permanent Fund"
                value={transferText}
                onChangeText={setTransferText}
                keyboardType="numeric"
              />
              <FilterChips
                label="Money location"
                value={location}
                options={LOCATION_OPTIONS}
                onChange={setLocation}
              />
            </>
          ) : (
            <StatusStrip
              tone="muted"
              message="Only a Pandal Admin can transfer unused cash to the Permanent Fund. You can still close with a zero transfer."
            />
          )}
        </View>
      </Section>
    </FormShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  count: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
});
