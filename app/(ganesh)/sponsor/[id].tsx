import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Building2,
  Check,
  ChevronRight,
  Gift,
  Mail,
  MapPin,
  Package,
  Phone,
  Receipt,
} from "lucide-react-native";

import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSignedPreview } from "@/components/ganesh/GaneshSignedPreview";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import {
  FilterChips,
  GaneshHeader,
  MetaLabel,
  Money,
  Section,
  StatTile,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
  type StatusKind,
  GaneshEmptyState,
} from "@/components/ganesh/ui";
import { SkeletonList } from "@/components/common/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalSponsor, useSponsorHistory } from "@/hooks/usePandalSponsors";
import { useSponsorships } from "@/hooks/useSponsorships";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { PaymentMethod, SponsorshipPurpose } from "@/shared/types/ganesh";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_UNITS } from "@/shared/utils/ganeshAssets";
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

/** Deal status → badge. Colour never carries the meaning alone (§35). */
function dealBadge(status: string): { kind: StatusKind; label?: string } {
  switch (status) {
    case "overdue":
      return { kind: "overdue" };
    case "received":
      return { kind: "received" };
    case "confirmed":
      return { kind: "sponsored", label: "Confirmed" };
    case "promised":
      return { kind: "promised" };
    case "cancelled":
      return { kind: "cancelled" };
    default:
      return { kind: "neutral", label: "Prospective" };
  }
}

export default function SponsorDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { pandalId, festivalId } = useGaneshSession();
  const { isOnline } = useNetwork();

  const { festivals } = useFestivals(pandalId);
  const { sponsor, loading } = usePandalSponsor(pandalId, params.id ?? null);
  const { sponsorships } = useSponsorships(pandalId, festivalId);
  const otherFestivalIds = festivals
    .filter((item) => item.id !== festivalId)
    .map((item) => item.id);
  const { history } = useSponsorHistory(pandalId, params.id ?? null, otherFestivalIds);
  const { members } = usePandalMembers(pandalId);
  const { can, isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [receivedNotes, setReceivedNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [cancelReason, setCancelReason] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [purpose, setPurpose] = useState<SponsorshipPurpose>("other");
  const [purposeLabel, setPurposeLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [addAsAsset, setAddAsAsset] = useState(false);
  const [assetCategory, setAssetCategory] =
    useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] =
    useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
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
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Sponsor"
          icon={<Building2 size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <SkeletonList count={4} />
      </GaneshScreen>
    );
  }

  if (!sponsor) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Sponsor"
          icon={<Building2 size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshEmptyState
          icon={<Building2 size={22} color={g.saffron} strokeWidth={2.2} />}
          title="Sponsor not found"
          description="They may have been removed, or belong to another Pandal."
        />
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

  const received = totals.cashReceived + totals.inKindReceived;
  const promised = totals.promisedCash + totals.promisedInKind;

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title={sponsor.name}
        subtitle={sponsor.type}
        icon={<Building2 size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <PendingHint pending={sponsor.pendingWrite} />

      <Section title="This festival" subtitle={festival?.name}>
        <View style={styles.statRow}>
          <StatTile
            label="Received"
            meta={<MetaLabel>Counted in the ledger</MetaLabel>}
          >
            <Money value={received} size="primary" tone="positive" numberOfLines={1} adjustsFontSizeToFit />
          </StatTile>
          <StatTile label="Promised" meta={<MetaLabel>Not cash yet</MetaLabel>}>
            <Money
              value={promised}
              size="primary"
              tone={promised > 0 ? "warning" : "default"}
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
        </View>
      </Section>

      {canSeeContact
      && (sponsor.mobile || sponsor.email || sponsor.address || sponsor.notes || photoPath) ? (
        <Section title="Contact">
          <View style={styles.factList}>
            {sponsor.mobile ? (
              <Fact
                icon={<Phone size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
                label="Mobile"
                value={sponsor.mobile}
              />
            ) : null}
            {sponsor.email ? (
              <Fact
                icon={<Mail size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
                label="Email"
                value={sponsor.email}
              />
            ) : null}
            {sponsor.address ? (
              <Fact
                icon={<MapPin size={14} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
                label="Address"
                value={sponsor.address}
              />
            ) : null}
            {sponsor.notes ? <Fact label="Notes" value={sponsor.notes} /> : null}
          </View>
          {pandalId && photoPath ? (
            <View style={styles.logo}>
              <GaneshSignedPreview path={photoPath} pandalId={pandalId} />
            </View>
          ) : null}
        </Section>
      ) : null}

      {can("sponsors.update") && openFestival ? (
        editingProfile ? (
          <Section title="Edit profile">
            <View style={styles.form}>
              <Input label="Name" value={name} onChangeText={setName} />
              <Input
                label="Mobile"
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
              />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
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
              <Button variant="ghost" onPress={() => setEditingProfile(false)}>
                Cancel
              </Button>
            </View>
          </Section>
        ) : (
          <Button variant="outline" onPress={() => setEditingProfile(true)}>
            Edit profile
          </Button>
        )
      ) : null}

      <Section
        title="Sponsorships"
        subtitle={
          deals.length === 0
            ? "No deals in the current festival"
            : `${deals.length} this festival · tap to open one`
        }
      >
        {deals.length === 0 ? (
          <GaneshEmptyState
            compact
            icon={<Gift size={20} color={g.saffron} strokeWidth={2.2} />}
            title="No deal yet"
            description="Add a sponsorship to track what they are giving this year."
          />
        ) : (
          <View style={styles.deals}>
            {deals.map((deal) => {
              const badge = dealBadge(
                isSponsorshipOverdue(deal) ? "overdue" : sponsorshipStatusLabel(deal)
              );
              const isSelected = selected?.id === deal.id;
              const typeLabel =
                SPONSORING_TYPES.find((item) => item.id === deal.sponsoringType)?.label
                ?? deal.sponsoringType;

              return (
                <Pressable
                  key={deal.id}
                  onPress={() => {
                    void haptic.selection();
                    setActiveId(deal.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${purposeLabelOf(deal.purpose, deal.purposeLabel)}, ${typeLabel}`}
                  android_ripple={{
                    color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
                    borderless: false,
                  }}
                  style={({ pressed }) => [
                    styles.deal,
                    {
                      backgroundColor: isSelected ? g.wash(g.saffron) : g.tile,
                      borderColor: isSelected ? g.saffron : "transparent",
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={styles.dealTop}>
                    <View style={styles.dealCopy}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.dealTitle,
                          {
                            color: theme.colors.foreground,
                            fontFamily: theme.fontFamily.semibold,
                          },
                        ]}
                      >
                        {purposeLabelOf(deal.purpose, deal.purposeLabel)}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.dealMeta,
                          {
                            color: theme.colors.mutedForeground,
                            fontFamily: theme.fontFamily.regular,
                          },
                        ]}
                      >
                        {typeLabel}
                        {deal.expectedDate ? ` · Expected ${deal.expectedDate}` : ""}
                      </Text>
                    </View>
                    <View style={styles.dealValue}>
                      <Money value={sponsorshipValue(deal)} size="primary" />
                      <StatusBadge kind={badge.kind} label={badge.label} size="sm" />
                    </View>
                  </View>
                  <PendingHint pending={deal.pendingWrite} />
                </Pressable>
              );
            })}
          </View>
        )}
      </Section>

      {selected ? (
        <>
          {selected.contributionId || selected.expenseId || selected.assetId ? (
            <Section title="Linked records">
              {selected.contributionId ? (
                <LinkRow
                  icon={<Gift size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
                  title="Contribution"
                  meta="The record this gift created"
                  divider={Boolean(selected.expenseId || selected.assetId)}
                  onPress={() =>
                    push(`/(ganesh)/contribution/${selected.contributionId}` as never)
                  }
                />
              ) : null}
              {selected.expenseId ? (
                <LinkRow
                  icon={<Receipt size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
                  title="Expense"
                  meta="The spend this sponsorship covers"
                  divider={Boolean(selected.assetId)}
                  onPress={() => push(`/(ganesh)/expense/${selected.expenseId}` as never)}
                />
              ) : null}
              {selected.assetId ? (
                <LinkRow
                  icon={<Package size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
                  title="Pandal asset"
                  meta="Where this item now lives"
                  onPress={() => push(`/(ganesh)/asset/${selected.assetId}` as never)}
                />
              ) : null}
            </Section>
          ) : null}

          {selected.receivedAt ? (
            <StatusStrip
              tone="positive"
              icon={<Check size={14} color={g.godFund} strokeWidth={2.6} />}
              message={`Received ${formatGaneshWhen(selected.receivedAt)}${
                selected.receivedBy
                  ? ` · ${memberDisplayName(members, selected.receivedBy)}`
                  : ""
              }`}
            />
          ) : null}

          {can("sponsors.update") && openFestival && isOpenSponsorship(selected) ? (
            <Section title="Edit deal">
              <View style={styles.form}>
                <FilterChips
                  label="Purpose"
                  value={purpose}
                  options={SPONSORSHIP_PURPOSES}
                  onChange={setPurpose}
                />
                {purpose === "other" ? (
                  <Input
                    label="Purpose label"
                    value={purposeLabel}
                    onChangeText={setPurposeLabel}
                  />
                ) : null}
                <Input
                  label={
                    selected.sponsoringType === "cash" || selected.sponsoringType === "expense"
                      ? "Amount"
                      : "Estimated value"
                  }
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
                          selected.sponsoringType === "cash"
                          || selected.sponsoringType === "expense"
                            ? Number(amount || 0)
                            : undefined,
                        estimatedValue:
                          selected.sponsoringType === "item"
                          || selected.sponsoringType === "service"
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
            </Section>
          ) : null}

          {can("sponsors.update")
          && openFestival
          && (isProspective(selected) || isPromisedSponsorship(selected)) ? (
            <View style={styles.actionRow}>
              {isProspective(selected) ? (
                <Button
                  style={styles.actionButton}
                  loading={busy}
                  onPress={() =>
                    run(writes.promiseSponsorship(selected.id), "Could not update.")
                  }
                >
                  Mark promised
                </Button>
              ) : null}
              {isPromisedSponsorship(selected) ? (
                <Button
                  style={styles.actionButton}
                  loading={busy}
                  onPress={() =>
                    run(writes.confirmSponsorship(selected.id), "Could not confirm.")
                  }
                >
                  Confirm
                </Button>
              ) : null}
            </View>
          ) : null}

          {can("sponsors.receive")
          && openFestival
          && (isPromisedSponsorship(selected) || isConfirmed(selected))
          && (selected.sponsoringType !== "expense" || Boolean(selected.expenseId)) ? (
            <Section title="Mark received">
              <View style={styles.form}>
                {selected.sponsoringType === "cash" && !isOnline ? (
                  <StatusStrip
                    tone="warning"
                    message="Connect to the internet to mark cash received, so it is counted exactly once."
                  />
                ) : selected.sponsoringType === "cash" ? (
                  <StatusStrip
                    tone="info"
                    message={`This adds ${formatInr(
                      sponsorshipValue(selected)
                    )} to festival cash.`}
                  />
                ) : (
                  <StatusStrip
                    tone="muted"
                    message="In-kind and expense sponsorships do not change festival cash."
                  />
                )}

                {selected.sponsoringType === "cash" ? (
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

                {can("assets.create")
                && selected.sponsoringType === "item"
                && !selected.assetId ? (
                  <View style={styles.form}>
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
                          {
                            color: theme.colors.foreground,
                            fontFamily: theme.fontFamily.regular,
                          },
                        ]}
                      >
                        Also add as a Pandal asset
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
            </Section>
          ) : null}

          {selected.sponsoringType === "expense" && isOpenSponsorship(selected) ? (
            <StatusStrip
              tone="muted"
              message="Expense sponsorship is not income. Link it from Add expense when you record the spend."
            />
          ) : null}

          {can("sponsors.cancel") && openFestival && isOpenSponsorship(selected) ? (
            <Section title="Cancel this deal" subtitle="The record stays. Cash does not change.">
              <View style={styles.form}>
                <Input
                  label="Reason (optional)"
                  value={cancelReason}
                  onChangeText={setCancelReason}
                />
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
                          run(
                            writes.cancelSponsorship(selected.id, cancelReason),
                            "Could not cancel."
                          ),
                      },
                    ])
                  }
                >
                  Cancel sponsorship
                </Button>
              </View>
            </Section>
          ) : null}
        </>
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
        <Section
          title="Other years"
          subtitle="History only — these amounts are not in this festival's totals."
        >
          {history.map((row, index) => {
            const yearName =
              festivals.find((item) => item.id === row.festivalId)?.name ?? "Earlier festival";
            const badge = dealBadge(row.status);
            return (
              <View
                key={`${row.festivalId}-${row.id}`}
                style={[
                  styles.historyRow,
                  index < history.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: g.divider,
                  },
                ]}
              >
                <View style={styles.historyCopy}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.historyTitle,
                      { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                    ]}
                  >
                    {yearName}
                  </Text>
                  <MetaLabel>{purposeLabelOf(row.purpose, row.purposeLabel)}</MetaLabel>
                </View>
                <View style={styles.historyValue}>
                  <Money value={sponsorshipValue(row)} size="secondary" />
                  <StatusBadge kind={badge.kind} label={badge.label} size="sm" />
                </View>
              </View>
            );
          })}
        </Section>
      ) : null}
    </GaneshScreen>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.fact}>
      <View style={styles.factLabel}>
        {icon}
        <MetaLabel>{label}</MetaLabel>
      </View>
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
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  factList: {
    gap: 12,
  },
  fact: {
    gap: 2,
  },
  factLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  factValue: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  logo: {
    marginTop: 12,
  },
  form: {
    gap: 12,
  },
  deals: {
    gap: 10,
  },
  deal: {
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 12,
    gap: 6,
    overflow: "hidden",
  },
  dealTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  dealCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dealTitle: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  dealMeta: {
    fontSize: 11.5,
  },
  dealValue: {
    alignItems: "flex-end",
    gap: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
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
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
  },
  historyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  historyTitle: {
    fontSize: 14,
  },
  historyValue: {
    alignItems: "flex-end",
    gap: 4,
  },
});
