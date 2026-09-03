import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { CalendarDays } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FundLocationChips } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  GaneshHeader,
  Money,
  StatStrip,
  StatTile,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
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
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { useTheme } from "@/theme/ThemeProvider";

export default function CloseFestivalScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { isOnline } = useNetwork();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    retry: retrySummary,
  } = useGaneshSummary(pandalId, festivalId);
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
  const settled = !summaryLoading && !summaryError;
  const remaining = useMemo(
    () => Math.round((closing - (Number.isFinite(transfer) ? transfer : 0)) * 100) / 100,
    [closing, transfer]
  );

  const confirm = () => {
    // Belt and braces: the button is disabled while the summary is unresolved,
    // but a settlement is irreversible, so refuse here too rather than trust the
    // disabled prop (GS-007).
    if (!settled) {
      toast.error("Totals are still loading. Wait for them before closing.");
      return;
    }
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
    Alert.alert(
      "Close this festival?",
      remainingAmount > 0
        ? `${formatInr(remainingAmount)} stays in this festival. It is still the Pandal's money and shows under "What the Pandal holds" on the Permanent Fund screen, but it will not be in this festival's ledger for next year. Closing cannot be undone from this screen.`
        : "Closing cannot be undone from this screen. Money and seva cannot be added until an admin reopens it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close festival",
          style: "destructive",
          onPress: () => {
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
          },
        },
      ]
    );
  };

  if (!can("festival.close")) {
    return <GaneshWriteLock message="Only a Pandal Admin or Treasurer can close this festival." />;
  }

  // Every figure below comes from the summary, which starts at all zeros. Until
  // the snapshot lands, "Closing cash ₹0" is not a fact — and closing on it
  // strands the real balance with no settlement record and no way back, because
  // the rules refuse every ledger write on a closed festival.
  if (summaryLoading || summaryError) {
    return (
      <GaneshScreen>
        <GaneshHeader
          title="Close festival"
          icon={<CalendarDays size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <AdminQueryState
          loading={summaryLoading}
          error={summaryError}
          onRetry={retrySummary}
          skeletonCount={5}
        />
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Close festival"
        subtitle={festival?.name}
        icon={<CalendarDays size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Choose how much unused festival cash should move to the Permanent Pandal Fund. Nothing is
        transferred unless you enter an amount and confirm. This is a fund transfer, not a donation
        or expense.
      </Text>
      <PermanentFundCard fund={fund} />
      <StatStrip>
        <StatTile label="Opening funds">
          <Money value={summary.openingFunds} size="secondary" />
        </StatTile>
        <StatTile label="Collections">
          <Money value={summary.chanda} size="secondary" />
        </StatTile>
        <StatTile label="Committee">
          <Money value={summary.committeeContributions} size="secondary" />
        </StatTile>
        <StatTile label="Other cash">
          <Money value={summary.otherCashContributions} size="secondary" />
        </StatTile>
        <StatTile label="God Fund expenses">
          <Money value={summary.godFundExpenses} size="secondary" />
        </StatTile>
        <StatTile label="Reimbursements">
          <Money value={summary.reimbursements} size="secondary" />
        </StatTile>
        <StatTile label="Closing cash">
          <Money value={closing} size="secondary" />
        </StatTile>
        <StatTile label="Pending reimbursements">
          <Money value={summary.pendingReimbursements} size="secondary" />
        </StatTile>
        <StatTile label="Members">
          <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: 17 }}>
            {members.length}
          </Text>
        </StatTile>
      </StatStrip>
      {closing < 0 ? (
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
          This festival is short {formatInr(Math.abs(closing))}. Transfer that amount from the
          Permanent Fund first. Closing with a deficit is not a settlement.
        </Text>
      ) : null}
      {canTransfer ? (
        <>
          <Input
            label="Transfer to Permanent Fund"
            value={transferText}
            onChangeText={setTransferText}
            keyboardType="numeric"
          />
          <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Money location</Text>
          <FundLocationChips value={location} onChange={setLocation} />
        </>
      ) : (
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
          Only a Pandal Admin can transfer unused cash to the Permanent Fund. You can still close
          with a ₹0 transfer.
        </Text>
      )}
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          Remaining in festival {formatInr(Number.isFinite(remaining) ? remaining : 0)}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          Transfer + remaining must equal {formatInr(closing)}. Enter {formatInr(closing)} to move
          everything, or 0 to keep the closing balance in this festival — it stays the Pandal's
          either way, and anything left here is listed under "What the Pandal holds".
        </Text>
      </View>
      {!isOnline && transfer > 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Transfer requires an active connection. Please reconnect and try again.
        </Text>
      ) : null}
      <Button loading={busy} disabled={!settled || closing < 0} onPress={confirm}>
        Confirm settlement and close
      </Button>
    </GaneshScreen>
  );
}
