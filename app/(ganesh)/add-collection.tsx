import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Wallet } from "lucide-react-native";

import { DuplicateHouseholdDialog } from "@/components/ganesh/DuplicateHouseholdDialog";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  MoreDetails,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { possibleHouseholdDuplicates } from "@/shared/utils/ganeshMath";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import type { PaymentMethod } from "@/shared/types/ganesh";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddCollectionScreen() {
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { realUser } = useAuth();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { members } = usePandalMembers(pandalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();

  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [collectorId, setCollectorId] = useState(realUser?.uid ?? "");
  const [mobile, setMobile] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<typeof households>([]);

  const collectorOptions = useMemo(
    () =>
      members
        .filter((member) => member.status === "active" || member.status == null)
        .map((member) => ({ id: member.userId, label: member.displayName })),
    [members]
  );

  const optionalFilled = [mobile, houseNumber, address, notes].filter((value) =>
    value.trim()
  ).length;

  const payload = useMemo(
    () => ({
      donorName,
      amount: Number(amount),
      paymentMethod: method,
      collectorId: collectorId || realUser?.uid || "",
      date: todayDateInput(),
      mobile,
      houseNumber,
      address,
      notes,
      expectedAmount: festival?.householdTargetAmount ?? 0,
      createHousehold: true,
    }),
    [
      address,
      amount,
      collectorId,
      donorName,
      festival?.householdTargetAmount,
      houseNumber,
      method,
      mobile,
      notes,
      realUser?.uid,
    ]
  );

  const save = async () => {
    setBusy(true);
    try {
      await writes.addCollection(payload);
      back();
    } catch (error) {
      logError("ganesh.addCollection", error);
      toast.error(friendlyErrorMessage(error, "Could not save collection."));
    } finally {
      setBusy(false);
      setMatches([]);
    }
  };

  const onSubmit = () => {
    const foundIds = new Set(
      possibleHouseholdDuplicates(households, {
        name: donorName,
        houseNumber,
        mobile,
      }).map((household) => household.id)
    );
    const found = households.filter((household) => foundIds.has(household.id));
    if (found.length > 0) {
      setMatches(found);
      return;
    }
    void save();
  };

  if (!can("collections.create")) {
    return <GaneshWriteLock message="Your role cannot add collections." />;
  }

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <>
      <FormShell
        title="Add collection"
        subtitle={festival?.name}
        icon={<Wallet size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        submitLabel="Save collection"
        submitting={busy}
        submitDisabled={!donorName.trim() || !amountValid}
        onSubmit={onSubmit}
        footerHint={
          festival?.householdTargetAmount
            ? (
                <StatusStrip
                  tone="muted"
                  message={`Household target is ${formatInr(festival.householdTargetAmount)}.`}
                />
              )
            : null
        }
      >
        {/* Four fields, nothing else — this is the app's most repeated task. */}
        <Section title="Collection" plain>
          <View style={styles.form}>
            <Input
              label="Donor name"
              value={donorName}
              onChangeText={setDonorName}
              placeholder="Ramesh Kumar"
              autoCapitalize="words"
              autoFocus
            />
            <Input
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="500"
            />
            <FilterChips
              label="Payment method"
              value={method}
              options={METHOD_OPTIONS}
              onChange={setMethod}
            />
            {collectorOptions.length > 1 ? (
              <FilterChips
                label="Collected by"
                value={collectorId}
                options={collectorOptions}
                onChange={setCollectorId}
              />
            ) : null}
          </View>
        </Section>

        <MoreDetails filledCount={optionalFilled}>
          <Input
            label="Mobile"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            placeholder="98765 43210"
          />
          <Input
            label="House number"
            value={houseNumber}
            onChangeText={setHouseNumber}
            placeholder="12"
          />
          <Input
            label="Address or area"
            value={address}
            onChangeText={setAddress}
          />
          <Input label="Notes" value={notes} onChangeText={setNotes} />
        </MoreDetails>
      </FormShell>

      {matches.length > 0 ? (
        <DuplicateHouseholdDialog
          matches={matches}
          onCancel={() => setMatches([])}
          onContinue={() => void save()}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
});
