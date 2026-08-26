import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarPlus } from "lucide-react-native";

import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { PermanentFundCard } from "@/components/ganesh/PermanentFundCard";
import {
  FilterChips,
  FormShell,
  Money,
  Section,
  StatTile,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
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

const LOCATION_OPTIONS: Array<{ id: PermanentFundLocation; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function CreateFestivalScreen() {
  const g = useGaneshTokens();
  const { replace, back } = useRouter();
  const { pandalId, setSession } = useGaneshSession();
  const { fund } = usePermanentFund(pandalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { isOnline } = useNetwork();

  const defaultYear = new Date().getFullYear();
  const [name, setName] = useState(`Ganesh Chaturthi ${defaultYear}`);
  const [year, setYear] = useState(String(defaultYear));
  const [allocate, setAllocate] = useState("0");
  const [location, setLocation] = useState<PermanentFundLocation>("cash");
  const [busy, setBusy] = useState(false);

  const allocateAmount = Number(allocate || 0);
  const safeAllocate = Number.isFinite(allocateAmount) ? allocateAmount : 0;
  const remaining = fund.total - safeAllocate;
  const overDrawn = safeAllocate > fund[location];

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
    const festivalYear = Number(year);
    if (!Number.isFinite(festivalYear) || festivalYear < 2000) {
      toast.error("Enter a valid year.");
      return;
    }
    setBusy(true);
    try {
      const festivalId = await writes.createFestival({ name, year: festivalYear });
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

  if (!can("festival.create")) {
    return <GaneshWriteLock message="Only a Pandal Admin can create a festival." />;
  }

  return (
    <FormShell
      title="Create festival"
      subtitle="Starts a fresh ledger"
      icon={<CalendarPlus size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel="Create festival"
      submitting={busy}
      submitDisabled={!name.trim() || (safeAllocate > 0 && (!isOnline || overDrawn))}
      onSubmit={() => void create()}
      footerHint={
        !isOnline && safeAllocate > 0 ? (
          <StatusStrip
            tone="warning"
            message="Moving money from the Permanent Fund needs an active connection."
          />
        ) : overDrawn ? (
          <StatusStrip
            tone="warning"
            message={`Only ${formatInr(fund[location])} is held as ${location.toUpperCase()}.`}
          />
        ) : null
      }
    >
      <Section title="The festival" plain>
        <View style={styles.form}>
          <Input
            label="Festival name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
          <Input label="Year" value={year} onChangeText={setYear} keyboardType="numeric" />
        </View>
      </Section>

      <Section
        title="Opening money"
        subtitle="The Permanent Fund stays with the Pandal. Leave this at 0 to start with nothing from it — nothing moves automatically."
      >
        <View style={styles.form}>
          <PermanentFundCard fund={fund} />

          <View style={styles.statRow}>
            <StatTile label="Into the festival">
              <Money value={safeAllocate} size="primary" numberOfLines={1} adjustsFontSizeToFit />
            </StatTile>
            <StatTile label="Stays permanent">
              <Money
                value={Number.isFinite(remaining) ? remaining : fund.total}
                size="primary"
                numberOfLines={1}
                adjustsFontSizeToFit
              />
            </StatTile>
          </View>

          <Input
            label="Opening funds from the Permanent Fund"
            value={allocate}
            onChangeText={setAllocate}
            keyboardType="numeric"
          />
          <FilterChips
            label="Money location"
            value={location}
            options={LOCATION_OPTIONS}
            onChange={setLocation}
          />
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
  },
});
