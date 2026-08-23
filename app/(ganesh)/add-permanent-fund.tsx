import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { FundLocationChips } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
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
  const { back } = useRouter();
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
      await writes.seedPermanentFund({
        amount: parsedAmount,
        location,
        description,
      });
      if (canAllocate && parsedAllocate > 0 && festival) {
        await writes.transferPermanentToFestival({
          festivalId: festival.id,
          amount: parsedAllocate,
          location,
          festivalName: festival.name,
          description: `Opening funds for ${festival.name}`,
        });
      }
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
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Permanent Fund already exists
        </Text>
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
          This Pandal already has {formatInr(fund.total)}. Open the Permanent Fund to add a
          donation or adjust the balance.
        </Text>
        <Button onPress={back}>Go back</Button>
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        Add Permanent Fund
      </Text>
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
