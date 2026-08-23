import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";

import { FundLocationChips } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePermanentFund } from "@/hooks/usePermanentFund";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { PERMANENT_FUND_OFFLINE_ERROR } from "@/services/ganesh/ganeshPermanentFund";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { PermanentFundLocation } from "@/shared/types/ganesh";
import { validateFundTransfer, validateNonNegativeAmount } from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function CreateFestivalScreen() {
  const { theme } = useTheme();
  const { replace } = useRouter();
  const { pandalId, setSession } = useGaneshSession();
  const { fund } = usePermanentFund(pandalId);
  const writes = useGaneshWrites();
  const { isOnline } = useNetwork();
  const year = new Date().getFullYear();
  const [name, setName] = useState(`Ganesh Chaturthi ${year}`);
  const [allocate, setAllocate] = useState("0");
  const [location, setLocation] = useState<PermanentFundLocation>("cash");
  const [busy, setBusy] = useState(false);
  const allocateAmount = Number(allocate || 0);
  const remaining = fund.total - (Number.isFinite(allocateAmount) ? allocateAmount : 0);

  const create = async () => {
    if (!name.trim()) {
      toast.error("Enter a festival name.");
      return;
    }
    const nonNegative = validateNonNegativeAmount(allocateAmount, "Permanent Fund amount");
    if (!nonNegative.ok) {
      toast.error(nonNegative.error);
      return;
    }
    if (allocateAmount > 0 && !isOnline) {
      toast.error(PERMANENT_FUND_OFFLINE_ERROR);
      return;
    }
    if (allocateAmount > 0) {
      const allowed = validateFundTransfer(allocateAmount, fund[location], "Permanent Fund");
      if (!allowed.ok) {
        toast.error(allowed.error);
        return;
      }
    }
    setBusy(true);
    try {
      const festivalId = await writes.createFestival({ name, year });
      if (allocateAmount > 0) {
        await writes.transferPermanentToFestival({
          festivalId,
          amount: allocateAmount,
          location,
          festivalName: name,
          description: `Opening funds for ${name}`,
        });
      }
      if (pandalId) await setSession({ pandalId, festivalId });
      replace("/(ganesh)" as never);
    } catch (error) {
      logError("ganesh.createFestival", error);
      toast.error(friendlyErrorMessage(error, "Could not create the festival."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        Create Ganesh Festival
      </Text>
      <PermanentFundCard fund={fund} />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        The Permanent Fund stays with the Pandal. Enter 0 if this festival should start with no
        money from it. Nothing is moved automatically.
      </Text>
      <Input label="Festival" value={name} onChangeText={setName} />
      <Input
        label="Opening funds from Permanent Fund"
        value={allocate}
        onChangeText={setAllocate}
        keyboardType="numeric"
      />
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>Money location</Text>
      <FundLocationChips value={location} onChange={setLocation} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.colors.mutedForeground }}>
          From Permanent Fund: {formatInr(Number.isFinite(allocateAmount) ? allocateAmount : 0)}
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          Permanent Fund remaining: {formatInr(Number.isFinite(remaining) ? remaining : fund.total)}
        </Text>
      </View>
      {!isOnline && allocateAmount > 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Transfer requires an active connection. Please reconnect and try again.
        </Text>
      ) : null}
      <Button loading={busy} onPress={() => void create()}>
        Create Festival
      </Button>
    </GaneshScreen>
  );
}
