import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Landmark } from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  GaneshHeader,
  Money,
  Section,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { EmptyState } from "@/components/common/EmptyState";
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

const LOCATION_OPTIONS: Array<{ id: PermanentFundLocation; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddPermanentFundScreen() {
  const g = useGaneshTokens();
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
    festivals.find((item) => item.id === festivalId && item.status === "open")
    ?? festivals.find((item) => item.status === "open");

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
      await writes.seedPermanentFund({ amount: parsedAmount, location, description });
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
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Permanent Fund"
          icon={<Landmark size={22} color={g.maroon} strokeWidth={2.2} />}
          onBack={back}
        />
        <EmptyState
          illustration="vaults"
          title="Already recorded"
          description={`This Pandal already has ${formatInr(
            fund.total
          )}. Open the Permanent Fund to add a donation or adjust the balance.`}
          primaryAction={{ label: "Go back", onPress: back }}
        />
      </GaneshScreen>
    );
  }

  return (
    <FormShell
      title="Add Permanent Fund"
      subtitle="Carries across festivals"
      icon={<Landmark size={22} color={g.maroon} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Save Permanent Fund"
      submitting={busy}
      submitDisabled={!isOnline || !Number.isFinite(parsedAmount) || parsedAmount <= 0}
      onSubmit={() => void save()}
      footerHint={
        !isOnline ? (
          <StatusStrip
            tone="warning"
            message="Adding the Permanent Fund needs an active connection, so the balance is counted exactly once."
          />
        ) : null
      }
    >
      <StatusStrip
        tone="info"
        message="Record money that already belongs to the Pandal. Saying No at setup only skipped this step — this is not a festival donation."
      />

      <Section title="Existing balance" plain>
        <View style={styles.form}>
          <Input
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            autoFocus
          />
          <FilterChips
            label="Money location"
            value={location}
            options={LOCATION_OPTIONS}
            onChange={setLocation}
          />
          <Input
            label="Source or description"
            value={description}
            onChangeText={setDescription}
            placeholder="Existing Pandal fund"
          />
        </View>
      </Section>

      {festival && canAllocate ? (
        <Section
          title="Use some for this festival"
          subtitle={`Leave this at 0 to keep everything in the Permanent Fund. Destination: ${festival.name}.`}
        >
          <View style={styles.form}>
            <View style={styles.statRow}>
              <StatTile label={`To ${festival.name}`}>
                <Money
                  value={Number.isFinite(parsedAllocate) ? parsedAllocate : 0}
                  size="primary"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                />
              </StatTile>
              <StatTile label="Stays permanent">
                <Money value={remaining} size="primary" numberOfLines={1} adjustsFontSizeToFit />
              </StatTile>
            </View>
            <Input
              label="Amount for this festival"
              value={allocateAmount}
              onChangeText={setAllocateAmount}
              keyboardType="numeric"
            />
          </View>
        </Section>
      ) : null}
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
  },
});
