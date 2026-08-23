import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FundLocationChips } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { MetricGrid } from "@/components/ganesh/MetricGrid";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
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
import { useTheme } from "@/theme/ThemeProvider";

export default function CloseFestivalScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const { isOnline } = useNetwork();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { summary } = useGaneshSummary(pandalId, festivalId);
  const { members } = useFestivalMembers(pandalId, festivalId);
  const { fund } = usePermanentFund(pandalId);
  const writes = useGaneshWrites();
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
    const settlement = validateSettlement({
      closing,
      transfer: Number.isFinite(transfer) ? transfer : 0,
      remaining,
    });
    if (!settlement.ok) {
      toast.error(settlement.error);
      return;
    }
    setBusy(true);
    writes
      .closeFestival({
        transferAmount: Number.isFinite(transfer) ? transfer : 0,
        remainingAmount: remaining,
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

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        Festival closing
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Choose how much unused festival cash should move to the Permanent Pandal Fund. Nothing is
        transferred unless you enter an amount and confirm. This is a fund transfer, not a donation
        or expense.
      </Text>
      <PermanentFundCard fund={fund} />
      <MetricGrid
        items={[
          { label: "Opening funds", value: summary.openingFunds },
          { label: "Collections", value: summary.chanda },
          { label: "Committee contributions", value: summary.committeeContributions },
          { label: "Other cash", value: summary.otherCashContributions },
          { label: "God Fund expenses", value: summary.godFundExpenses },
          { label: "Reimbursements", value: summary.reimbursements },
          { label: "Closing cash", value: closing },
          { label: "Pending reimbursements", value: summary.pendingReimbursements },
          { label: "Members", value: `${members.length}` },
        ]}
      />
      {closing < 0 ? (
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
          This festival is short {formatInr(Math.abs(closing))}. Transfer that amount from the
          Permanent Fund first. Closing with a deficit is not a settlement.
        </Text>
      ) : null}
      <Input
        label="Transfer to Permanent Fund"
        value={transferText}
        onChangeText={setTransferText}
        keyboardType="numeric"
      />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Money location</Text>
      <FundLocationChips value={location} onChange={setLocation} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
          Remaining in festival {formatInr(Number.isFinite(remaining) ? remaining : 0)}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          Transfer + remaining must equal {formatInr(closing)}. Enter {formatInr(closing)} to move
          everything, or 0 to keep the closing balance in this festival.
        </Text>
      </View>
      {!isOnline && transfer > 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Transfer requires an active connection. Please reconnect and try again.
        </Text>
      ) : null}
      <Button loading={busy} disabled={closing < 0} onPress={confirm}>
        Confirm settlement and close
      </Button>
    </GaneshScreen>
  );
}
