import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  Check,
  ChevronRight,
  Gift,
  HandHeart,
  IndianRupee,
  Package,
} from "lucide-react-native";

import { accountabilityText } from "@/components/ganesh/AccountabilityLine";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import {
  FilterChips,
  FundHero,
  GaneshHeader,
  MetaLabel,
  Section,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
  type StatusKind,
} from "@/components/ganesh/ui";
import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshContribution } from "@/hooks/useContributions";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { ContributionKind, PaymentMethod } from "@/shared/types/ganesh";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_UNITS } from "@/shared/utils/ganeshAssets";
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

const KIND_LABEL: Record<ContributionKind, string> = {
  money: "Money",
  item: "Item",
  service: "Service",
  sponsorship: "Sponsorship",
};

function kindIcon(kind: ContributionKind) {
  switch (kind) {
    case "money":
      return IndianRupee;
    case "item":
      return Package;
    case "service":
      return HandHeart;
    default:
      return Building2;
  }
}

export default function ContributionDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
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
  const [assetCategory, setAssetCategory] =
    useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] =
    useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const festival = festivals.find((item) => item.id === festivalId);
  const linkedAsset = assets.find((item) => item.id === contribution?.assetId);
  const photoPath = ganeshStoredPath(contribution?.photo, contribution?.photoPath);
  const openFestival = festival?.status === "open";
  const promised = isPromised(contribution);

  const canReceive = can("contributions.receive") && openFestival && promised;
  const canCancel = can("contributions.cancel") && openFestival && promised;
  const canEdit = can("contributions.update") && openFestival && promised;
  const canLinkAsset =
    can("assets.create")
    && (contribution?.kind === "item" || contribution?.kind === "sponsorship")
    && !contribution?.assetId;
  const moneyOffline = contribution?.kind === "money" && !isOnline;

  useEffect(() => {
    if (!contribution) return;
    setExpectedDate(contribution.expectedDate ?? todayDateInput());
    setDescription(contribution.description ?? "");
    setMobile(contribution.mobile ?? "");
    setAssetQty(contribution.quantity?.trim() || "1");
  }, [contribution?.id, contribution?.updatedAt?.seconds]);

  if (loading && !contribution) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Contribution"
          icon={<Gift size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <SkeletonList count={4} />
      </GaneshScreen>
    );
  }

  if (!contribution) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Contribution"
          icon={<Gift size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <EmptyState
          illustration="search"
          title="Contribution not found"
          description="It may belong to another festival, or it was removed."
        />
      </GaneshScreen>
    );
  }

  const value = contributionValue(contribution);
  const badge = contributionStatusLabel(contribution) as StatusKind;
  const Icon = kindIcon(contribution.kind);
  const isMoney = contribution.kind === "money";

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
    const message = isMoney
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
              paymentMethod: isMoney ? paymentMethod : undefined,
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
    <GaneshScreen safeTop>
      <GaneshHeader
        title={contribution.itemName || contribution.contributorName}
        subtitle={
          [KIND_LABEL[contribution.kind], festival?.name].filter(Boolean).join(" · ") || undefined
        }
        icon={<Icon size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        rightElement={<StatusBadge kind={badge} />}
      />

      <FundHero
        eyebrow={isMoney ? "Amount" : "Estimated value"}
        amount={value}
        kind={isMoney ? "god" : "inKind"}
        footer={
          <Text
            style={[
              styles.attribution,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
            ]}
          >
            {accountabilityText({
              contributedBy: contribution.contributorName,
              enteredBy: memberDisplayName(members, contribution.createdBy),
            })}
            {formatGaneshWhen(contribution.createdAt, contribution.date)
              ? `\n${formatGaneshWhen(contribution.createdAt, contribution.date)}`
              : ""}
          </Text>
        }
      />

      <PendingHint pending={contribution.pendingWrite} />

      {promised ? (
        <StatusStrip
          tone="warning"
          message={`Promised${
            contribution.expectedDate ? ` · expected ${contribution.expectedDate}` : ""
          }. This is not cash until you mark it received.`}
        />
      ) : null}

      {contribution.cancelReason ? (
        <StatusStrip tone="muted" message={`Cancelled: ${contribution.cancelReason}`} />
      ) : null}

      <Section title="Details">
        <View style={styles.factList}>
          <Fact label="Type" value={KIND_LABEL[contribution.kind]} />
          {contribution.quantity ? <Fact label="Quantity" value={contribution.quantity} /> : null}
          {contribution.mobile ? <Fact label="Mobile" value={contribution.mobile} /> : null}
          {contribution.paymentMethod ? (
            <Fact label="Paid by" value={contribution.paymentMethod.toUpperCase()} />
          ) : null}
          {contribution.receivedAt ? (
            <Fact
              label="Received"
              value={`${formatGaneshWhen(contribution.receivedAt)}${
                contribution.receivedBy
                  ? ` · ${memberDisplayName(members, contribution.receivedBy)}`
                  : ""
              }`}
            />
          ) : null}
          {contribution.receivedNotes ? (
            <Fact label="Received notes" value={contribution.receivedNotes} />
          ) : null}
          {contribution.description ? (
            <Fact label="Description" value={contribution.description} />
          ) : null}
        </View>
      </Section>

      {contribution.sponsorId || linkedAsset ? (
        <Section title="Linked records">
          {contribution.sponsorId ? (
            <LinkRow
              icon={<Building2 size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              title={contribution.contributorName}
              meta="Sponsor profile"
              divider={Boolean(linkedAsset)}
              onPress={() => push(`/(ganesh)/sponsor/${contribution.sponsorId}` as never)}
            />
          ) : null}
          {linkedAsset ? (
            <LinkRow
              icon={<Package size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              title={linkedAsset.name}
              meta="Pandal asset created from this gift"
              onPress={() => push(`/(ganesh)/asset/${linkedAsset.id}` as never)}
            />
          ) : null}
        </Section>
      ) : null}

      {pandalId && festivalId && photoPath ? (
        <Section title="Photo" plain>
          <GaneshSignedPreview path={photoPath} pandalId={pandalId} festivalId={festivalId} />
        </Section>
      ) : null}

      {canReceive ? (
        <Section title="Mark received">
          <View style={styles.form}>
            {moneyOffline ? (
              <StatusStrip
                tone="warning"
                message="Connect to the internet to mark money received, so cash is recorded exactly once."
              />
            ) : isMoney ? (
              <StatusStrip
                tone="info"
                message={`This adds ${formatInr(value)} to festival cash.`}
              />
            ) : (
              <StatusStrip
                tone="muted"
                message="Received in-kind does not change festival cash."
              />
            )}

            {isMoney ? (
              <FilterChips
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
              <>
                <Pressable
                  onPress={() => {
                    void haptic.selection();
                    setAddAsAsset((prev) => !prev);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: addAsAsset }}
                  accessibilityLabel="Also add as Pandal asset"
                  style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.85 }]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      addAsAsset
                        ? { backgroundColor: g.saffron, borderColor: g.saffron }
                        : { borderColor: g.divider },
                    ]}
                  >
                    {addAsAsset ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.checkLabel,
                      { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
                    ]}
                  >
                    Also add this to Pandal assets
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
                    <FilterChips
                      label="Category"
                      value={assetCategory}
                      options={ASSET_CATEGORIES}
                      onChange={setAssetCategory}
                    />
                    <FilterChips
                      label="Unit"
                      value={assetUnit}
                      options={ASSET_UNITS}
                      onChange={setAssetUnit}
                    />
                    <FilterChips
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
              </>
            ) : null}

            <Button loading={busy} disabled={moneyOffline} onPress={confirmReceive}>
              Mark received
            </Button>
          </View>
        </Section>
      ) : null}

      {canEdit ? (
        editing ? (
          <Section title="Edit promise">
            <View style={styles.form}>
              <Input
                label="Expected date"
                value={expectedDate}
                onChangeText={setExpectedDate}
                placeholder="YYYY-MM-DD"
              />
              <Input
                label="Mobile"
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
              />
              <Input label="Description" value={description} onChangeText={setDescription} />
              <Button
                loading={busy}
                onPress={() =>
                  run(
                    writes
                      .updatePromisedContribution(contribution.id, {
                        expectedDate,
                        description,
                        mobile,
                      })
                      .then(() => setEditing(false)),
                    "Could not save contribution."
                  )
                }
              >
                Save details
              </Button>
              <Button variant="ghost" onPress={() => setEditing(false)}>
                Cancel
              </Button>
            </View>
          </Section>
        ) : (
          <Button variant="outline" onPress={() => setEditing(true)}>
            Edit promise
          </Button>
        )
      ) : null}

      {canCancel ? (
        <Section title="Cancel promise" subtitle="The record stays in history. Cash does not change.">
          <View style={styles.form}>
            <Input label="Reason (optional)" value={cancelReason} onChangeText={setCancelReason} />
            <Button variant="outline" loading={busy} onPress={confirmCancel}>
              Cancel contribution
            </Button>
          </View>
        </Section>
      ) : null}
    </GaneshScreen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.fact}>
      <MetaLabel>{label}</MetaLabel>
      <Text
        style={[
          styles.factValue,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function LinkRow({
  icon,
  title,
  meta,
  divider,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  divider?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}`}
      android_ripple={{
        color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
        borderless: false,
      }}
      style={({ pressed }) => [
        styles.linkRow,
        divider && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: g.divider,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.linkGlyph, { backgroundColor: g.tile }]}>{icon}</View>
      <View style={styles.linkCopy}>
        <Text
          numberOfLines={1}
          style={[
            styles.linkTitle,
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
          ]}
        >
          {title}
        </Text>
        <MetaLabel>{meta}</MetaLabel>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  attribution: {
    fontSize: 12,
    lineHeight: 17,
  },
  factList: {
    gap: 12,
  },
  fact: {
    gap: 1,
  },
  factValue: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  form: {
    gap: 12,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
  },
  linkGlyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  linkCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  linkTitle: {
    fontSize: 14.5,
  },
});
