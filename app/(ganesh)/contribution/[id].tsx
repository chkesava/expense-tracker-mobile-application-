import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AccountabilityLine } from "@/components/ganesh/AccountabilityLine";
import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshContribution } from "@/hooks/useContributions";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { PaymentMethod } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_UNITS,
} from "@/shared/utils/ganeshAssets";
import {
  contributionStatusLabel,
  contributionValue,
  isPromised,
} from "@/shared/utils/ganeshContributions";
import { formatGaneshWhen, memberDisplayName, todayDateInput } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const PAYMENT_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function ContributionDetailScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { isOnline } = useNetwork();
  const { festivals } = useFestivals(pandalId);
  const { contribution, loading } = useGaneshContribution(pandalId, festivalId, params.id ?? null);
  const { assets } = usePandalAssets(pandalId);
  const { members } = usePandalMembers(pandalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const [expectedDate, setExpectedDate] = useState("");
  const [description, setDescription] = useState("");
  const [mobile, setMobile] = useState("");
  const [receivedNotes, setReceivedNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cancelReason, setCancelReason] = useState("");
  const [addAsAsset, setAddAsAsset] = useState(false);
  const [assetCategory, setAssetCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const festival = festivals.find((item) => item.id === festivalId);
  const linkedAsset = assets.find((item) => item.id === contribution?.assetId);
  const photoPath = ganeshStoredPath(contribution?.photo, contribution?.photoPath);
  const openFestival = festival?.status === "open";
  const promised = isPromised(contribution);
  const canReceive = can("contributions.receive") && openFestival && promised;
  const canCancel = can("contributions.cancel") && openFestival && promised;
  const canEdit = can("contributions.update") && openFestival && promised;
  const canLinkAsset =
    can("assets.create") &&
    (contribution?.kind === "item" || contribution?.kind === "sponsorship") &&
    !contribution?.assetId;
  const moneyOffline = contribution?.kind === "money" && !isOnline;
  const badge = contribution ? contributionStatusLabel(contribution) : "promised";

  useEffect(() => {
    if (!contribution) return;
    setExpectedDate(contribution.expectedDate ?? todayDateInput());
    setDescription(contribution.description ?? "");
    setMobile(contribution.mobile ?? "");
    setAssetQty(contribution.quantity?.trim() || "1");
  }, [contribution?.id, contribution?.updatedAt?.seconds]);

  if (loading && !contribution) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.mutedForeground }}>Loading contribution…</Text>
      </GaneshScreen>
    );
  }

  if (!contribution) {
    return (
      <GaneshScreen>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Contribution not found
        </Text>
        <Text style={{ color: theme.colors.mutedForeground }}>
          It may belong to another festival, or it was removed.
        </Text>
      </GaneshScreen>
    );
  }

  const value = contributionValue(contribution);
  const badgeStyle =
    badge === "overdue"
      ? { backgroundColor: theme.colors.destructive, color: theme.colors.destructiveForeground }
      : badge === "received"
        ? { backgroundColor: theme.colors.success, color: theme.colors.successForeground }
        : badge === "cancelled"
          ? { backgroundColor: theme.colors.muted, color: theme.colors.mutedForeground }
          : { backgroundColor: theme.colors.warning, color: theme.colors.warningForeground };

  const run = (work: Promise<unknown>, fallback: string) => {
    setBusy(true);
    work
      .catch((error) => {
        logError("ganesh.contributionDetail", error);
        toast.error(friendlyErrorMessage(error, fallback));
      })
      .finally(() => setBusy(false));
  };

  const confirmReceive = () => {
    const message =
      contribution.kind === "money"
        ? `This adds ${formatInr(value)} to festival cash.`
        : "This marks the gift as received. It does not change festival cash.";
    Alert.alert("Mark received?", message, [
      { text: "Not now", style: "cancel" },
      {
        text: "Mark received",
        onPress: () =>
          run(
            writes.receiveContribution(contribution.id, {
              kind: contribution.kind,
              receivedNotes,
              paymentMethod: contribution.kind === "money" ? paymentMethod : undefined,
              pandalAsset:
                addAsAsset && canLinkAsset
                  ? {
                      name: contribution.itemName?.trim() || contribution.contributorName,
                      category: assetCategory,
                      quantity: Number(assetQty || 0),
                      unit: assetUnit,
                      estimatedValue: contribution.estimatedValue,
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

  const confirmCancel = () => {
    Alert.alert("Cancel this promise?", "The record stays in history. Cash does not change.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel promise",
        style: "destructive",
        onPress: () =>
          run(writes.cancelContribution(contribution.id, cancelReason), "Could not cancel."),
      },
    ]);
  };

  return (
    <GaneshScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800", flex: 1 }}>
          {contribution.itemName || contribution.contributorName}
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: badgeStyle.backgroundColor,
          }}
        >
          <Text style={{ color: badgeStyle.color, fontWeight: "700", fontSize: 12, textTransform: "capitalize" }}>
            {badge}
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>{formatInr(value)}</Text>
      <Text style={{ color: theme.colors.mutedForeground, textTransform: "capitalize" }}>
        {contribution.kind}
        {contribution.quantity ? ` · ${contribution.quantity}` : ""}
      </Text>
      {festival ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{festival.name}</Text>
      ) : null}
      {contribution.expectedDate ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Expected {contribution.expectedDate}
        </Text>
      ) : null}
      {contribution.receivedAt ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Received {formatGaneshWhen(contribution.receivedAt)}
          {contribution.receivedBy
            ? ` · ${memberDisplayName(members, contribution.receivedBy)}`
            : ""}
        </Text>
      ) : null}
      {contribution.paymentMethod ? (
        <Text style={{ color: theme.colors.mutedForeground, textTransform: "capitalize" }}>
          Paid by {contribution.paymentMethod}
        </Text>
      ) : null}
      {contribution.receivedNotes ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{contribution.receivedNotes}</Text>
      ) : null}
      {contribution.cancelReason ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Cancelled: {contribution.cancelReason}
        </Text>
      ) : null}
      {contribution.mobile ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{contribution.mobile}</Text>
      ) : null}
      {contribution.description ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{contribution.description}</Text>
      ) : null}
      <AccountabilityLine
        contributedBy={contribution.contributorName}
        enteredBy={memberDisplayName(members, contribution.createdBy)}
        at={contribution.createdAt}
        date={contribution.date}
      />
      <PendingHint pending={contribution.pendingWrite} />
      {linkedAsset ? (
        <Pressable
          onPress={() => push(`/(ganesh)/asset/${linkedAsset.id}` as never)}
          style={{
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Linked asset</Text>
          <Text style={{ color: theme.colors.mutedForeground }}>{linkedAsset.name}</Text>
        </Pressable>
      ) : null}
      {pandalId && festivalId && photoPath ? (
        <GaneshSignedPreview path={photoPath} pandalId={pandalId} festivalId={festivalId} />
      ) : null}

      {canEdit ? (
        <View style={{ gap: 16 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Edit promise</Text>
          <Input
            label="Expected date"
            value={expectedDate}
            onChangeText={setExpectedDate}
            placeholder="YYYY-MM-DD"
          />
          <Input label="Mobile" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
          <Input label="Description" value={description} onChangeText={setDescription} />
          <Button
            loading={busy}
            onPress={() =>
              run(
                writes.updatePromisedContribution(contribution.id, {
                  expectedDate,
                  description,
                  mobile,
                }),
                "Could not save contribution."
              )
            }
          >
            Save details
          </Button>
        </View>
      ) : null}

      {canReceive ? (
        <View style={{ gap: 16 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Mark received</Text>
          {moneyOffline ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              Connect to the internet to mark money received so cash is recorded once.
            </Text>
          ) : contribution.kind === "money" ? (
            <Text style={{ color: theme.colors.mutedForeground }}>
              This adds {formatInr(value)} to festival cash.
            </Text>
          ) : (
            <Text style={{ color: theme.colors.mutedForeground }}>
              Received in-kind does not change festival cash.
            </Text>
          )}
          {contribution.kind === "money" ? (
            <ChoiceChips
              label="Payment method"
              value={paymentMethod}
              options={PAYMENT_OPTIONS}
              onChange={setPaymentMethod}
            />
          ) : null}
          <Input
            label="Notes (optional)"
            value={receivedNotes}
            onChangeText={setReceivedNotes}
          />
          {canLinkAsset ? (
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
          <Button loading={busy} disabled={moneyOffline} onPress={confirmReceive}>
            Mark received
          </Button>
        </View>
      ) : null}

      {canCancel ? (
        <View style={{ gap: 16 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Cancel promise</Text>
          <Input
            label="Reason (optional)"
            value={cancelReason}
            onChangeText={setCancelReason}
          />
          <Button variant="outline" loading={busy} onPress={confirmCancel}>
            Cancel contribution
          </Button>
        </View>
      ) : null}
    </GaneshScreen>
  );
}
