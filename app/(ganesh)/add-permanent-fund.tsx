import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Landmark } from "lucide-react-native";

import { FormDetails } from "@/components/ganesh/FormDetails";
import { FundLocationChips } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { PERMANENT_FUND_OFFLINE_ERROR } from "@/services/ganesh/ganeshPermanentFund";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { PermanentFundLocation } from "@/shared/types/ganesh";
import { validateFundTransfer, validatePositiveAmount } from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function AddPermanentFundScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back, replace } = useRouter();
  const { isOnline } = useNetwork();
  const { pandalId, festivalId } = useGaneshSession();
  const { fund } = usePermanentFund(pandalId);
  const { festivals } = useFestivals(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const canAdd = can("permanentFund.add");
  const canAllocate = can("permanentFund.transfer");
  const [amount, setAmount] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("0");
  const [location, setLocation] = useState<PermanentFundLocation>("cash");
  const [description, setDescription] = useState("Money saved from previous years");
  const [busy, setBusy] = useState(false);

  const festival =
    festivals.find((item) => item.id === festivalId && item.status === "open") ??
    festivals.find((item) => item.status === "open");
  const parsedAmount = Number(amount);
  const parsedAllocate = Number(allocateAmount || 0);
  const remaining = Number.isFinite(parsedAmount)
    ? Math.max(0, parsedAmount - (Number.isFinite(parsedAllocate) ? parsedAllocate : 0))
    : 0;

  const save = async () => {
    const amountOk = validatePositiveAmount(parsedAmount, "Permanent Fund");
    if (!amountOk.ok) {
      toast.error(amountOk.error);
      return;
    }
    if (!isOnline) {
      toast.error(PERMANENT_FUND_OFFLINE_ERROR);
      return;
    }
    if (canAllocate && parsedAllocate > 0) {
      const allowed = validateFundTransfer(parsedAllocate, parsedAmount, "Permanent Fund");
      if (!allowed.ok) {
        toast.error(allowed.error);
        return;
      }
      if (!festival) {
        toast.error("Open a festival before moving money into it.");
        return;
      }
    }
    setBusy(true);
    try {
      // One call, one transaction (GS-070). This used to await the seed and
      // then await the transfer: each atomic on its own, the pair not — so a
      // failure between them left the Fund holding everything and the festival
      // with nothing, and this screen then refused to re-run because
      // `fund.total > 0`.
      const allocating = canAllocate && parsedAllocate > 0 && festival;
      await writes.seedPermanentFundWithAllocation({
        amount: parsedAmount,
        location,
        description,
        allocation: allocating
          ? {
              festivalId: festival.id,
              amount: parsedAllocate,
              festivalName: festival.name,
              description: `Opening funds for ${festival.name}`,
            }
          : undefined,
      });
      back();
    } catch (error) {
      logError("ganesh.addPermanentFund", error);
      toast.error(friendlyErrorMessage(error, "Could not add the Permanent Fund."));
    } finally {
      setBusy(false);
    }
  };

  if (!canAdd) {
    return <GaneshWriteLock message="You do not have permission to add the Permanent Fund." />;
  }

  if (fund.total > 0) {
    return (
      <GaneshScreen>
        <GaneshHeader
          title="Permanent Fund"
          icon={<Landmark size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }}>
          Permanent Fund already exists
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
          This Pandal already has {formatInr(fund.total)}. Open the Permanent Fund to add a
          donation, adjust the balance, or use part of it for this festival.
        </Text>
        {/* GS-070 criterion 2: a Pandal left half-set-up by the old
            non-atomic flow — Fund seeded, festival unfunded — needs a way
            through from here. This screen refuses to re-seed, correctly, but
            used to dead-end on "Go back" without naming where the allocation
            can still be completed. */}
        <Button onPress={() => replace("/(ganesh)/permanent-fund" as never)}>
          Open Permanent Fund
        </Button>
        <Button variant="outline" onPress={back}>
          Go back
        </Button>
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Add Permanent Fund"
        icon={<Landmark size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Record money that already belongs to the Pandal. Saying No at setup only skipped this
        step. This is not a festival donation.
      </Text>
      <Input
        label="Existing Permanent Fund"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="0"
      />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Money location</Text>
      <FundLocationChips value={location} onChange={setLocation} />
      <Input
        label="Source / description"
        value={description}
        onChangeText={setDescription}
        placeholder="Existing Pandal Fund"
      />
      {festival && canAllocate ? (
        <FormDetails label="Allocate to this festival">
          <View style={{ gap: 8 }}>
            <Input
              label={`Use for ${festival.name} (0 keeps it in the Permanent Fund)`}
              value={allocateAmount}
              onChangeText={setAllocateAmount}
              keyboardType="numeric"
            />
            <Text style={{ color: theme.colors.mutedForeground }}>
              Remaining Permanent Fund {formatInr(remaining)}.
            </Text>
          </View>
        </FormDetails>
      ) : null}
      {!isOnline ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Adding the Permanent Fund needs an active connection.
        </Text>
      ) : null}
      <Button loading={busy} onPress={() => void save()}>
        Save Permanent Fund
      </Button>
    </GaneshScreen>
  );
}
