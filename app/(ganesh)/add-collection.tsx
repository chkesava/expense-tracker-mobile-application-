import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
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
  householdStatusLabel,
  possibleDuplicateCollections,
  possibleHouseholdDuplicates,
} from "@/shared/utils/ganeshMath";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { HouseholdVisitOutcome, PaymentMethod } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

const METHOD_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000];

const VISIT_ACTIONS: Array<{ id: HouseholdVisitOutcome; label: string }> = [
  { id: "visited", label: "Visited" },
  { id: "promised", label: "Promised" },
  { id: "follow_up", label: "Follow-up" },
];

function quickAmountOptions(target?: number): number[] {
  const amounts = new Set(QUICK_AMOUNTS);
  if (target && target > 0) amounts.add(Math.round(target));
  return [...amounts].sort((a, b) => a - b);
}

export default function AddCollectionScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back, push } = useRouter();
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
    if (query.length < 1) return [];
    const digits = query.replace(/\D/g, "");
    return households
      .filter((household) => {
        const name = household.name.trim().toLowerCase();
        const house = (household.houseNumber ?? "").trim().toLowerCase();
        const mobileDigits = (household.mobile ?? "").replace(/\D/g, "");
        const areaValue = (household.area ?? "").trim().toLowerCase();
        return (
          name.includes(query)
          || (house.length > 0 && house.includes(query))
          || (areaValue.length > 0 && areaValue.includes(query))
          || (digits.length >= 3 && mobileDigits.includes(digits))
        );
      })
      .slice(0, 6);
  }, [households, householdSearch]);

  const quickAmounts = useMemo(
    () =>
      quickAmountOptions(
        remaining && remaining > 0 ? remaining : festival?.householdTargetAmount
      ),
    [festival?.householdTargetAmount, remaining]
  );

  const payload = useMemo(
    () => ({
      donorName: donorName.trim() || selectedHousehold?.name || "",
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
      selectedHousehold?.name,
    ]
  );

  const clearAmount = () => {
    setAmount("");
    clientOpIdRef.current = null;
  };

  const nextHouse = () => {
    setHouseholdId(null);
    setDonorName("");
    setHouseNumber("");
    setMobile("");
    setAddress("");
    setArea("");
    setNotes("");
    setHouseholdSearch("");
    clearAmount();
  };

  const save = async (targetHouseholdId?: string | null) => {
    if (busy) return;
    setBusy(true);
    if (!clientOpIdRef.current) clientOpIdRef.current = newId();
    try {
      const result = await writes.addCollection({
        ...payload,
        householdId: targetHouseholdId ?? undefined,
        clientOpId: clientOpIdRef.current,
        assignReceipt: isOnline,
        sessionId: openSession?.id,
      });
      if (result.householdId) setHouseholdId(result.householdId);
      clearAmount();
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
    setDonorName(household.name);
    if (household.houseNumber) setHouseNumber(household.houseNumber);
    if (household.mobile) setMobile(household.mobile);
    if (household.area) setArea(household.area);
  };

  const proceedAfterDuplicateChecks = (targetHouseholdId?: string | null) => {
    setMatches([]);
    const resolvedHouseholdId = targetHouseholdId ?? householdId;
    const duplicates = possibleDuplicateCollections(collections, {
      householdId: resolvedHouseholdId,
      donorName: payload.donorName,
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
    if (!payload.donorName.trim()) {
      toast.error("Select a household or enter the donor name.");
      return;
    }
    if (householdId) {
      proceedAfterDuplicateChecks(householdId);
      return;
    }
    const foundIds = new Set(
      possibleHouseholdDuplicates(households, {
        name: payload.donorName,
        houseNumber,
        mobile,
      }).map((household) => household.id)
    );
    const found = households.filter((household) => foundIds.has(household.id));
    if (found.length > 0) {
      setMatches(found);
      return;
    }
    proceedAfterDuplicateChecks(null);
  };

  const recordVisit = async (outcome: HouseholdVisitOutcome) => {
    if (!selectedHousehold) {
      toast.error("Select a household first.");
      return;
    }
    if (busy) return;
    let promisedAmount: number | undefined;
    if (outcome === "promised") {
      const typed = Number(amount);
      const fallback =
        remaining && remaining > 0
          ? remaining
          : Number(selectedHousehold.expectedAmount ?? 0);
      promisedAmount = Number.isFinite(typed) && typed > 0 ? typed : fallback;
      if (!(promisedAmount > 0)) {
        toast.error("Enter the promised amount.");
        return;
      }
    }
    setBusy(true);
    try {
      await writes.recordVisit({
        householdId: selectedHousehold.id,
        outcome,
        promisedAmount,
        followUpAt: outcome === "follow_up" ? todayDateInput() : undefined,
      });
      if (outcome === "promised") setAmount("");
    } catch (error) {
      logError("ganesh.recordVisit", error);
      toast.error(friendlyErrorMessage(error, "Could not record the visit."));
    } finally {
      setBusy(false);
    }
  };

  if (!can("collections.create")) {
    return <GaneshWriteLock message="Your role cannot add collections." />;
  }
  if (closed) {
    return <GaneshWriteLock message={lockMessage} />;
  }

  const canSeedHousehold = can("collections.update");

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Add collection"
        icon={<Home size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      {!isOnline ? (
        <Text
          style={{
            color: g.saffron,
            fontFamily: theme.fontFamily.semibold,
            lineHeight: 20,
          }}
        >
          You are offline. Saves stay on this device until they sync — they are not confirmed in
          the cloud yet.
        </Text>
      ) : null}

      {selectedHousehold ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 14,
            padding: 12,
            gap: 6,
            borderCurve: "continuous",
          }}
        >
          <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
            {householdStatusLabel(selectedHousehold.status)}
          </Text>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            {selectedHousehold.name}
            {selectedHousehold.houseNumber ? ` · House #${selectedHousehold.houseNumber}` : ""}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            {selectedHousehold.expectedAmount > 0
              ? `Collected ${formatInr(selectedHousehold.collectedAmount)} of ${formatInr(selectedHousehold.expectedAmount)}`
              : `Collected ${formatInr(selectedHousehold.collectedAmount)}`}
            {selectedHousehold.status === "promised" && Number(selectedHousehold.promisedAmount ?? 0) > 0
              ? ` · promised ${formatInr(selectedHousehold.promisedAmount ?? 0)}`
              : ""}
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
          {selectedHousehold.collectedAmount <= 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {VISIT_ACTIONS.map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onPress={() => {
                    void recordVisit(action.id);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </View>
          ) : null}
          <Button variant="outline" onPress={nextHouse}>
            Next house
          </Button>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Input
            label="Search household"
            value={householdSearch}
            onChangeText={setHouseholdSearch}
            placeholder="Name, house number, area or mobile"
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
                borderCurve: "continuous",
              }}
            >
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                {household.name}
                {household.houseNumber ? ` · House #${household.houseNumber}` : ""}
              </Text>
              <Text style={{ color: theme.colors.mutedForeground }}>
                {householdStatusLabel(household.status)}
                {household.area ? ` · ${household.area}` : ""}
                {household.expectedAmount > 0
                  ? ` · ${formatInr(household.collectedAmount)} of ${formatInr(household.expectedAmount)}`
                  : ` · ${formatInr(household.collectedAmount)}`}
              </Text>
            </Pressable>
          ))}
          {householdSearch.trim().length >= 1 && householdResults.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              No household matches that. Enter a name below to record a new collection, or add the
              household first.
            </Text>
          ) : null}
          {canSeedHousehold ? (
            <Button variant="outline" onPress={() => push("/(ganesh)/add-household" as Href)}>
              Add household
            </Button>
          ) : null}
        </View>
      )}

      {selectedHousehold ? null : (
        <Input
          label="Name"
          value={donorName}
          onChangeText={setDonorName}
          placeholder="Ramesh Kumar"
        />
      )}
      <Input
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="500"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {quickAmounts.map((value) => (
          <Pressable
            key={value}
            onPress={() => setAmount(String(value))}
            style={{
              backgroundColor: amount === String(value) ? g.wash(g.saffron) : g.tile,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderCurve: "continuous",
            }}
          >
            <Text
              style={{
                color: amount === String(value) ? g.saffron : theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.semibold,
              }}
            >
              {formatInr(value)}
            </Text>
          </Pressable>
        ))}
      </View>
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
        {selectedHousehold ? (
          <Input label="Name" value={donorName} onChangeText={setDonorName} />
        ) : null}
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
        <Input label="Area / street (optional)" value={area} onChangeText={setArea} />
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
