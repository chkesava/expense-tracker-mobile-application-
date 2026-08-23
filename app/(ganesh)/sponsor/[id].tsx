import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalSponsor, useSponsorHistory } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { PaymentMethod, SponsorshipPurpose } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_UNITS,
} from "@/shared/utils/ganeshAssets";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import {
  SPONSORING_TYPES,
  SPONSORSHIP_PURPOSES,
  isConfirmed,
  isOpenSponsorship,
  isPromisedSponsorship,
  isProspective,
  isSponsorshipOverdue,
  purposeLabelOf,
  sponsorshipStatusLabel,
  sponsorshipValue,
  summarizeSponsorships,
} from "@/shared/utils/ganeshSponsors";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { useTheme } from "@/theme/ThemeProvider";

const PAYMENT_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function SponsorDetailScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { isOnline } = useNetwork();
  const { festivals } = useFestivals(pandalId);
  const { sponsor, loading } = usePandalSponsor(pandalId, params.id ?? null);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const otherFestivalIds = festivals.filter((item) => item.id !== festivalId).map((item) => item.id);
  const { history } = useSponsorHistory(pandalId, params.id ?? null, otherFestivalIds);
  const { members } = usePandalMembers(pandalId);
  const { can, isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [receivedNotes, setReceivedNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [cancelReason, setCancelReason] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [purpose, setPurpose] = useState<SponsorshipPurpose>("other");
  const [purposeLabel, setPurposeLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [addAsAsset, setAddAsAsset] = useState(false);
  const [assetCategory, setAssetCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const festival = festivals.find((item) => item.id === festivalId);
  const openFestival = festival?.status === "open";
  const canSeeContact = can("sponsors.update") || isAdmin;
  const deals = sponsorships.filter((row) => row.sponsorId === sponsor?.id);
  const totals = summarizeSponsorships(deals);
  const photoPath = ganeshStoredPath(sponsor?.photo);

  useEffect(() => {
    if (!sponsor) return;
    setName(sponsor.name);
    setMobile(sponsor.mobile ?? "");
    setEmail(sponsor.email ?? "");
    setAddress(sponsor.address ?? "");
    setNotes(sponsor.notes ?? "");
  }, [sponsor?.id, sponsor?.updatedAt?.seconds]);

  const selected = useMemo(
    () => deals.find((row) => row.id === activeId) ?? deals[0] ?? null,
    [activeId, deals]
  );

  useEffect(() => {
    if (!selected) return;
    setActiveId(selected.id);
    setExpectedDate(selected.expectedDate ?? "");
    setPurpose(selected.purpose);
    setPurposeLabel(selected.purposeLabel ?? "");
    setAmount(String(selected.amount || selected.estimatedValue || ""));
    setPaymentMethod(selected.paymentMethod ?? "upi");
  }, [selected?.id, selected?.updatedAt?.seconds]);

  if (loading && !sponsor) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.mutedForeground }}>Loading sponsor…</Text>
      </GaneshScreen>
    );
  }

  if (!sponsor) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Sponsor not found
        </Text>
      </GaneshScreen>
    );
  }

  const run = (work: Promise<unknown>, fallback: string) => {
    setBusy(true);
    work
      .catch((error) => {
        logError("ganesh.sponsorDetail", error);
        toast.error(friendlyErrorMessage(error, fallback));
      })
      .finally(() => setBusy(false));
  };

  const confirmReceive = () => {
    if (!selected) return;
    const value = sponsorshipValue(selected);
    const message =
      selected.sponsoringType === "cash"
        ? `This adds ${formatInr(value)} to festival cash.`
        : selected.sponsoringType === "expense"
          ? "Expense sponsorship is not income and does not change cash."
          : "This marks the gift as received. It does not change festival cash.";
    Alert.alert("Mark received?", message, [
      { text: "Not now", style: "cancel" },
      {
        text: "Mark received",
        onPress: () =>
          run(
            writes.receiveSponsorship(selected.id, {
              sponsoringType: selected.sponsoringType,
              receivedNotes,
              paymentMethod: selected.sponsoringType === "cash" ? paymentMethod : undefined,
              pandalAsset:
                addAsAsset && can("assets.create") && selected.sponsoringType === "item"
                  ? {
                      name: selected.itemName?.trim() || sponsor.name,
                      category: assetCategory,
                      quantity: Number(assetQty || 0),
                      unit: assetUnit,
                      estimatedValue: selected.estimatedValue,
                      condition: assetCondition,
                      location: assetLocation,
                    }
                  : undefined,
            }),
            "Could not mark received."
          ),
      },
    ]);
  };

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
        {sponsor.name}
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, textTransform: "capitalize" }}>
        {sponsor.type}
      </Text>
      {canSeeContact && sponsor.mobile ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{sponsor.mobile}</Text>
      ) : null}
      {canSeeContact && sponsor.email ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{sponsor.email}</Text>
      ) : null}
      {canSeeContact && sponsor.address ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{sponsor.address}</Text>
      ) : null}
      {canSeeContact && sponsor.notes ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{sponsor.notes}</Text>
      ) : null}
      {pandalId && photoPath ? (
        <GaneshSignedPreview path={photoPath} pandalId={pandalId} />
      ) : null}
      <PendingHint pending={sponsor.pendingWrite} />

      <Text style={{ color: theme.colors.mutedForeground }}>
        This festival: received {formatInr(totals.cashReceived + totals.inKindReceived)} · promised{" "}
        {formatInr(totals.promisedCash + totals.promisedInKind)}
      </Text>

      {can("sponsors.update") && openFestival ? (
        <View style={{ gap: 16 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Profile</Text>
          <Input label="Name" value={name} onChangeText={setName} />
          <Input label="Mobile" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Input label="Address" value={address} onChangeText={setAddress} />
          <Input label="Notes" value={notes} onChangeText={setNotes} />
          <Button
            loading={busy}
            onPress={() =>
              run(
                writes.updateSponsor(sponsor.id, { name, mobile, email, address, notes }),
                "Could not save sponsor."
              )
            }
          >
            Save profile
          </Button>
        </View>
      ) : null}

      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>This festival</Text>
      {deals.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>No deals in the current festival.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {deals.map((deal) => {
            const badge = isSponsorshipOverdue(deal) ? "overdue" : sponsorshipStatusLabel(deal);
            const selectedDeal = selected?.id === deal.id;
            return (
              <Pressable
                key={deal.id}
                onPress={() => setActiveId(deal.id)}
                style={{
                  backgroundColor: theme.colors.card,
                  borderColor: selectedDeal ? theme.colors.primary : theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 14,
                  gap: 4,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                  {purposeLabelOf(deal.purpose, deal.purposeLabel)}
                </Text>
                <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>
                  {formatInr(sponsorshipValue(deal))}
                </Text>
                <Text style={{ color: theme.colors.mutedForeground, textTransform: "capitalize" }}>
                  {SPONSORING_TYPES.find((item) => item.id === deal.sponsoringType)?.label ?? deal.sponsoringType}
                  {" · "}
                  {badge}
                </Text>
                <PendingHint pending={deal.pendingWrite} />
              </Pressable>
            );
          })}
        </View>
      )}

      {selected ? (
        <View style={{ gap: 16 }}>
          {selected.contributionId ? (
            <Pressable onPress={() => push(`/(ganesh)/contribution/${selected.contributionId}` as never)}>
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Open contribution</Text>
            </Pressable>
          ) : null}
          {selected.expenseId ? (
            <Pressable onPress={() => push(`/(ganesh)/expense/${selected.expenseId}` as never)}>
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Open expense</Text>
            </Pressable>
          ) : null}
          {selected.assetId ? (
            <Pressable onPress={() => push(`/(ganesh)/asset/${selected.assetId}` as never)}>
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Open asset</Text>
            </Pressable>
          ) : null}
          {selected.receivedAt ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              Received {formatGaneshWhen(selected.receivedAt)}
              {selected.receivedBy ? ` · ${memberDisplayName(members, selected.receivedBy)}` : ""}
            </Text>
          ) : null}

          {can("sponsors.update") && openFestival && isOpenSponsorship(selected) ? (
            <View style={{ gap: 16 }}>
              <ChoiceChips
                label="Purpose"
                value={purpose}
                options={SPONSORSHIP_PURPOSES}
                onChange={setPurpose}
              />
              {purpose === "other" ? (
                <Input label="Purpose label" value={purposeLabel} onChangeText={setPurposeLabel} />
              ) : null}
              <Input
                label={selected.sponsoringType === "cash" || selected.sponsoringType === "expense" ? "Amount" : "Estimated value"}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
              />
              <Input
                label="Expected date"
                value={expectedDate}
                onChangeText={setExpectedDate}
                placeholder="YYYY-MM-DD"
              />
              <Button
                loading={busy}
                onPress={() =>
                  run(
                    writes.updateOpenSponsorship(selected.id, {
                      purpose,
                      purposeLabel: purpose === "other" ? purposeLabel : undefined,
                      expectedDate,
                      amount:
                        selected.sponsoringType === "cash" || selected.sponsoringType === "expense"
                          ? Number(amount || 0)
                          : undefined,
                      estimatedValue:
                        selected.sponsoringType === "item" || selected.sponsoringType === "service"
                          ? Number(amount || 0)
                          : undefined,
                    }),
                    "Could not save sponsorship."
                  )
                }
              >
                Save deal
              </Button>
            </View>
          ) : null}

          {can("sponsors.update") && openFestival && isProspective(selected) ? (
            <Button loading={busy} onPress={() => run(writes.promiseSponsorship(selected.id), "Could not update.")}>
              Mark promised
            </Button>
          ) : null}
          {can("sponsors.update") && openFestival && isPromisedSponsorship(selected) ? (
            <Button loading={busy} onPress={() => run(writes.confirmSponsorship(selected.id), "Could not confirm.")}>
              Confirm
            </Button>
          ) : null}

          {can("sponsors.receive")
          && openFestival
          && (isPromisedSponsorship(selected) || isConfirmed(selected))
          && (selected.sponsoringType !== "expense" || Boolean(selected.expenseId)) ? (
            <View style={{ gap: 16 }}>
              {selected.sponsoringType === "cash" && !isOnline ? (
                <Text style={{ color: theme.colors.mutedForeground }}>
                  Connect to the internet to mark cash received so it is counted once.
                </Text>
              ) : selected.sponsoringType === "cash" ? (
                <Text style={{ color: theme.colors.mutedForeground }}>
                  This adds {formatInr(sponsorshipValue(selected))} to festival cash.
                </Text>
              ) : (
                <Text style={{ color: theme.colors.mutedForeground }}>
                  Received in-kind or expense sponsorship does not change festival cash.
                </Text>
              )}
              {selected.sponsoringType === "cash" ? (
                <ChoiceChips
                  label="Payment method"
                  value={paymentMethod}
                  options={PAYMENT_OPTIONS}
                  onChange={setPaymentMethod}
                />
              ) : null}
              <Input label="Notes (optional)" value={receivedNotes} onChangeText={setReceivedNotes} />
              {can("assets.create") && selected.sponsoringType === "item" && !selected.assetId ? (
                <View style={{ gap: 12 }}>
                  <Pressable
                    onPress={() => setAddAsAsset((prev) => !prev)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: addAsAsset ? theme.colors.primary : theme.colors.muted,
                    }}
                  >
                    <Text
                      style={{
                        color: addAsAsset ? theme.colors.primaryForeground : theme.colors.foreground,
                        fontWeight: "700",
                      }}
                    >
                      Also add as Pandal asset
                    </Text>
                  </Pressable>
                  {addAsAsset ? (
                    <>
                      <Input
                        label="Asset quantity"
                        value={assetQty}
                        onChangeText={setAssetQty}
                        keyboardType="number-pad"
                      />
                      <ChoiceChips
                        label="Asset category"
                        value={assetCategory}
                        options={ASSET_CATEGORIES}
                        onChange={setAssetCategory}
                      />
                      <ChoiceChips label="Unit" value={assetUnit} options={ASSET_UNITS} onChange={setAssetUnit} />
                      <ChoiceChips
                        label="Condition"
                        value={assetCondition}
                        options={ASSET_CONDITIONS}
                        onChange={setAssetCondition}
                      />
                      <Input
                        label="Location (optional)"
                        value={assetLocation}
                        onChangeText={setAssetLocation}
                      />
                    </>
                  ) : null}
                </View>
              ) : null}
              <Button
                loading={busy}
                disabled={selected.sponsoringType === "cash" && !isOnline}
                onPress={confirmReceive}
              >
                Mark received
              </Button>
            </View>
          ) : null}

          {selected.sponsoringType === "expense" && isOpenSponsorship(selected) ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              Expense sponsorship is not income. Link it from Add expense when you record the spend.
            </Text>
          ) : null}
          {can("sponsors.cancel") && openFestival && isOpenSponsorship(selected) ? (
            <View style={{ gap: 16 }}>
              <Input label="Cancel reason (optional)" value={cancelReason} onChangeText={setCancelReason} />
              <Button
                variant="outline"
                loading={busy}
                onPress={() =>
                  Alert.alert("Cancel this deal?", "The record stays. Cash does not change.", [
                    { text: "Keep", style: "cancel" },
                    {
                      text: "Cancel deal",
                      style: "destructive",
                      onPress: () =>
                        run(writes.cancelSponsorship(selected.id, cancelReason), "Could not cancel."),
                    },
                  ])
                }
              >
                Cancel sponsorship
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}

      {can("sponsors.create") && openFestival ? (
        <Button
          variant="outline"
          onPress={() => push(`/(ganesh)/add-sponsor?sponsorId=${sponsor.id}` as never)}
        >
          Add another sponsorship
        </Button>
      ) : null}

      {history.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Other years</Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            History only. These amounts are not in this festival&apos;s totals.
          </Text>
          {history.map((row) => {
            const yearName = festivals.find((item) => item.id === row.festivalId)?.name ?? "Earlier festival";
            return (
              <View
                key={`${row.festivalId}-${row.id}`}
                style={{
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 14,
                  gap: 4,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{yearName}</Text>
                <Text style={{ color: theme.colors.mutedForeground }}>
                  {purposeLabelOf(row.purpose, row.purposeLabel)} · {formatInr(sponsorshipValue(row))} ·{" "}
                  {row.status}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </GaneshScreen>
  );
}
