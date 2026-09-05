import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Home } from "lucide-react-native";

import { DuplicateHouseholdDialog } from "@/components/ganesh/DuplicateHouseholdDialog";
import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { FilterChips, GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCollections } from "@/hooks/useCollections";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useMyOpenSession } from "@/hooks/useCollectionSessions";
import { useHouseholds } from "@/hooks/useHouseholds";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { newId } from "@/lib/id";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import {
  householdOverpayAmount,
  possibleDuplicateCollections,
  possibleHouseholdDuplicates,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { PaymentMethod } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddCollectionScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const { realUser } = useAuth();
  const { isOnline } = useNetwork();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { members } = usePandalMembers(pandalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const { collections } = useCollections(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { session: openSession } = useMyOpenSession();
  const { can } = useGaneshPermissions();
  const { closed, lockMessage } = useFestivalWriteLock();
  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [collectorId, setCollectorId] = useState(realUser?.uid ?? "");
  const [mobile, setMobile] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<typeof households>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdSearch, setHouseholdSearch] = useState("");
  const clientOpIdRef = useRef<string | null>(null);

  const selectedHousehold = useMemo(
    () => households.find((household) => household.id === householdId) ?? null,
    [households, householdId]
  );

  const amountNumber = Number(amount);
  const overpay = selectedHousehold
    ? householdOverpayAmount({
        expectedAmount: selectedHousehold.expectedAmount,
        collectedAmount: selectedHousehold.collectedAmount,
        thisAmount: Number.isFinite(amountNumber) ? amountNumber : 0,
      })
    : 0;
  const remaining =
    selectedHousehold && selectedHousehold.expectedAmount > 0
      ? Math.max(0, selectedHousehold.expectedAmount - selectedHousehold.collectedAmount)
      : null;

  const householdResults = useMemo(() => {
    const query = householdSearch.trim().toLowerCase();
    if (query.length < 2) return [];
    const digits = query.replace(/\D/g, "");
    return households
      .filter((household) => {
        const name = household.name.trim().toLowerCase();
        const house = (household.houseNumber ?? "").trim().toLowerCase();
        const mobileDigits = (household.mobile ?? "").replace(/\D/g, "");
        return (
          name.includes(query)
          || (house.length > 0 && house.includes(query))
          || (digits.length >= 3 && mobileDigits.includes(digits))
        );
      })
      .slice(0, 6);
  }, [households, householdSearch]);

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
      area,
      notes,
      expectedAmount: festival?.householdTargetAmount ?? 0,
      createHousehold: true,
    }),
    [
      address,
      amount,
      area,
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

  const save = async (targetHouseholdId?: string | null) => {
    if (busy) return;
    setBusy(true);
    if (!clientOpIdRef.current) clientOpIdRef.current = newId();
    try {
      await writes.addCollection({
        ...payload,
        householdId: targetHouseholdId ?? undefined,
        clientOpId: clientOpIdRef.current,
        assignReceipt: isOnline,
        // GS-076: joins the collector's open session, if they have one. A
        // collection recorded outside a session is still valid — it is simply
        // not part of a cash handover — so this never blocks the save.
        sessionId: openSession?.id,
      });
      clientOpIdRef.current = null;
      back();
    } catch (error) {
      logError("ganesh.addCollection", error);
      toast.error(friendlyErrorMessage(error, "Could not save collection."));
    } finally {
      setBusy(false);
      setMatches([]);
    }
  };

  const pickHousehold = (household: (typeof households)[number]) => {
    setHouseholdId(household.id);
    setHouseholdSearch("");
    setMatches([]);
    if (!donorName.trim()) setDonorName(household.name);
    if (!houseNumber.trim() && household.houseNumber) setHouseNumber(household.houseNumber);
    if (!mobile.trim() && household.mobile) setMobile(household.mobile);
    if (!area.trim() && household.area) setArea(household.area);
  };

  const proceedAfterDuplicateChecks = (targetHouseholdId?: string | null) => {
    setMatches([]);
    const resolvedHouseholdId = targetHouseholdId ?? householdId;
    const duplicates = possibleDuplicateCollections(collections, {
      householdId: resolvedHouseholdId,
      donorName,
      houseNumber,
      amount: Number(amount),
      date: todayDateInput(),
    });
    if (duplicates.length === 0) {
      void save(resolvedHouseholdId);
      return;
    }
    const first = duplicates[0];
    const collector = memberDisplayName(members, first.collectorId);
    Alert.alert(
      "Possible duplicate collection",
      `${first.donorName} already has ${formatInr(first.amount)} on ${first.date}${
        collector ? ` · collected by ${collector}` : ""
      }${first.receiptNumber ? ` · ${first.receiptNumber}` : ""}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record anyway",
          onPress: () => {
            void save(resolvedHouseholdId);
          },
        },
      ]
    );
  };

  const onSubmit = () => {
    if (householdId) {
      proceedAfterDuplicateChecks(householdId);
      return;
    }
    const foundIds = new Set(
      possibleHouseholdDuplicates(households, { name: donorName, houseNumber, mobile }).map(
        (household) => household.id
      )
    );
    const found = households.filter((household) => foundIds.has(household.id));
    if (found.length > 0) {
      setMatches(found);
      return;
    }
    proceedAfterDuplicateChecks(null);
  };

  if (!can("collections.create")) {
    return <GaneshWriteLock message="Your role cannot add collections." />;
  }
  if (closed) {
    return <GaneshWriteLock message={lockMessage} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Add collection"
        icon={<Home size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      {selectedHousehold ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 14,
            padding: 12,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
            Adding to an existing household
          </Text>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {selectedHousehold.name}
            {selectedHousehold.houseNumber ? ` · House #${selectedHousehold.houseNumber}` : ""}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            {selectedHousehold.expectedAmount > 0
              ? `Collected ${formatInr(selectedHousehold.collectedAmount)} of ${formatInr(selectedHousehold.expectedAmount)}`
              : `Collected ${formatInr(selectedHousehold.collectedAmount)}`}
          </Text>
          {remaining !== null ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              Remaining target {formatInr(remaining)}
            </Text>
          ) : null}
          {overpay > 0 ? (
            <Text style={{ color: g.saffron, fontWeight: "700" }}>
              This amount is {formatInr(overpay)} over the expected target. You can still save it.
            </Text>
          ) : null}
          <Button variant="outline" onPress={() => setHouseholdId(null)}>
            Record as a new household instead
          </Button>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Input
            label="Already collected from this house before? (optional)"
            value={householdSearch}
            onChangeText={setHouseholdSearch}
            placeholder="Search by name, house number or mobile"
          />
          {householdResults.map((household) => (
            <Pressable
              key={household.id}
              onPress={() => pickHousehold(household)}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                {household.name}
                {household.houseNumber ? ` · House #${household.houseNumber}` : ""}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                {household.expectedAmount > 0
                  ? `Collected ${formatInr(household.collectedAmount)} of ${formatInr(household.expectedAmount)}`
                  : `Collected ${formatInr(household.collectedAmount)}`}
              </Text>
            </Pressable>
          ))}
          {householdSearch.trim().length >= 2 && householdResults.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              No household matches that. Fill the form below to start a new one.
            </Text>
          ) : null}
        </View>
      )}
      <Input label="Name" value={donorName} onChangeText={setDonorName} placeholder="Ramesh Kumar" />
      <Input
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="500"
      />
      <FilterChips
        label="Payment method"
        layout="wrap"
        value={method}
        options={METHOD_OPTIONS}
        onChange={setMethod}
      />
      <FilterChips
        label="Collected by"
        layout="wrap"
        value={collectorId}
        options={members.map((member) => ({ id: member.userId, label: member.displayName }))}
        onChange={setCollectorId}
      />
      <FormDetails>
        <Input
          label="Mobile (optional)"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
        />
        <Input
          label="House number (optional)"
          value={houseNumber}
          onChangeText={setHouseNumber}
        />
        <Input label="Address (optional)" value={address} onChangeText={setAddress} />
        <Input label="Area (optional)" value={area} onChangeText={setArea} />
        <Input label="Notes (optional)" value={notes} onChangeText={setNotes} />
      </FormDetails>
      <Button loading={busy} onPress={onSubmit}>
        Save collection
      </Button>
      {matches.length > 0 ? (
        <DuplicateHouseholdDialog
          matches={matches}
          busy={busy}
          onCancel={() => setMatches([])}
          onMerge={(id) => {
            setHouseholdId(id);
            proceedAfterDuplicateChecks(id);
          }}
          onCreateNew={() => proceedAfterDuplicateChecks(null)}
        />
      ) : null}
    </GaneshScreen>
  );
}
