import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2, Check } from "lucide-react-native";

import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  FormShell,
  MoreDetails,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalSponsor } from "@/hooks/usePandalSponsors";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type {
  PaymentMethod,
  SponsorType,
  SponsoringType,
  SponsorshipPurpose,
  SponsorshipStatus,
} from "@/shared/types/ganesh";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_UNITS } from "@/shared/utils/ganeshAssets";
import { formatInr } from "@/shared/utils/ganeshMoney";
import {
  SPONSOR_TYPES,
  SPONSORING_TYPES,
  SPONSORSHIP_PURPOSES,
  SPONSORSHIP_STATUSES,
} from "@/shared/utils/ganeshSponsors";
import { useTheme } from "@/theme/ThemeProvider";

const PAYMENT_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "other", label: "Other" },
];

export default function AddSponsorScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back } = useRouter();
  const params = useLocalSearchParams<{ sponsorId?: string }>();
  const existingSponsorId = typeof params.sponsorId === "string" ? params.sponsorId : "";

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { sponsor: existing } = usePandalSponsor(pandalId, existingSponsorId || null);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { isOnline, uploadSponsorPhoto } = useGaneshStorage();
  const { isOnline: networkOnline } = useNetwork();

  const [name, setName] = useState("");
  const [sponsorType, setSponsorType] = useState<SponsorType>("person");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [dealType, setDealType] = useState<SponsoringType>("cash");
  const [purpose, setPurpose] = useState<SponsorshipPurpose>("other");
  const [purposeLabel, setPurposeLabel] = useState("");
  const [status, setStatus] = useState<SponsorshipStatus>("prospective");
  const [amount, setAmount] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [addAsAsset, setAddAsAsset] = useState(false);
  const [assetCategory, setAssetCategory] =
    useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] =
    useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [photoStatus, setPhotoStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(existingSponsorId || null);
  const [busy, setBusy] = useState(false);

  const closed = festival?.status === "closed";
  const canReceive = can("sponsors.receive");
  const canLinkAsset = can("assets.create") && dealType === "item" && status === "received";
  const isCashDeal = dealType === "cash" || dealType === "expense";

  useEffect(() => {
    if (dealType === "expense" && status === "received") setStatus("promised");
  }, [dealType, status]);

  const cashReceive = dealType === "cash" && status === "received";
  const moneyOffline = cashReceive && !networkOnline;

  const statusOptions = SPONSORSHIP_STATUSES.filter((item) => {
    if (item.id === "cancelled") return false;
    if (item.id === "received" && (!canReceive || dealType === "expense")) return false;
    return true;
  });

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setSponsorType(existing.type);
    setMobile(existing.mobile ?? "");
    setEmail(existing.email ?? "");
    setAddress(existing.address ?? "");
    setNotes(existing.notes ?? "");
    setSavedId(existing.id);
  }, [existing?.id]);

  const persistPhoto = async (sponsorId: string, file: PreparedGaneshImage) => {
    if (!isOnline) {
      setPhotoStatus("waiting");
      return false;
    }
    setPhotoStatus("uploading");
    try {
      await uploadSponsorPhoto(sponsorId, file);
      setPhotoStatus("uploaded");
      return true;
    } catch (error) {
      logError("ganesh.sponsorPhotoUpload", error);
      setPhotoStatus("failed");
      toast.error("Sponsor saved, but photo upload failed.");
      return false;
    }
  };

  useEffect(() => {
    if (!isOnline || photoStatus !== "waiting" || !savedId || !photo) return;
    setBusy(true);
    void persistPhoto(savedId, photo)
      .then((ok) => {
        if (ok) back();
      })
      .finally(() => setBusy(false));
  }, [isOnline, photoStatus, savedId, photo]);

  if (!can("sponsors.create")) {
    return <GaneshWriteLock message="Your role cannot add sponsors." />;
  }

  const dealValue = isCashDeal ? Number(amount || 0) : Number(estimatedValue || 0);
  const addingToExisting = Boolean(existingSponsorId);
  const optionalFilled = [mobile, email, address, notes].filter((value) => value.trim()).length;

  const onSubmit = () => {
    const saveDeal = (sponsorId: string) =>
      writes.addSponsorship(sponsorId, {
        sponsoringType: dealType,
        purpose,
        purposeLabel: purpose === "other" ? purposeLabel : undefined,
        status,
        amount: Number(amount || 0),
        estimatedValue: Number(estimatedValue || 0),
        itemName,
        quantity,
        serviceDescription,
        expectedDate,
        notes: dealNotes,
        paymentMethod: dealType === "cash" ? paymentMethod : undefined,
        pandalAsset:
          addAsAsset && canLinkAsset
            ? {
                name: itemName.trim() || name.trim() || existing?.name || "Sponsored item",
                category: assetCategory,
                quantity: Number(assetQty || 0),
                unit: assetUnit,
                estimatedValue: Number(estimatedValue || 0),
                condition: assetCondition,
                location: assetLocation,
              }
            : undefined,
      });

    setBusy(true);
    const afterSave = async (sponsorId: string) => {
      setSavedId(sponsorId);
      if (!photo || addingToExisting) {
        back();
        return;
      }
      const uploaded = await persistPhoto(sponsorId, photo);
      if (uploaded) back();
    };

    const work = addingToExisting
      ? saveDeal(existingSponsorId).then(() => afterSave(existingSponsorId))
      : writes
          .createSponsor({ name, type: sponsorType, mobile, email, address, notes })
          .then((sponsorId) => saveDeal(sponsorId).then(() => afterSave(sponsorId)));

    work
      .catch((error) => {
        logError("ganesh.addSponsor", error);
        toast.error(friendlyErrorMessage(error, "Could not save sponsor."));
      })
      .finally(() => setBusy(false));
  };

  return (
    <FormShell
      title={addingToExisting ? "Add sponsorship" : "Add sponsor"}
      subtitle={addingToExisting ? existing?.name : festival?.name}
      icon={<Building2 size={22} color={g.saffron} strokeWidth={2.2} />}
      onBack={back}
      submitLabel={addingToExisting ? "Save sponsorship" : "Save sponsor"}
      submitting={busy}
      submitDisabled={closed || moneyOffline || (!addingToExisting && !name.trim())}
      onSubmit={onSubmit}
      footerHint={
        moneyOffline ? (
          <StatusStrip
            tone="warning"
            message="Connect to the internet to record received cash, so it is counted exactly once."
          />
        ) : cashReceive ? (
          <StatusStrip
            tone="info"
            message={`This adds ${formatInr(dealValue)} to festival cash.`}
          />
        ) : (
          <StatusStrip
            tone="muted"
            message="Prospective and promised deals do not change festival cash. In-kind is never cash."
          />
        )
      }
    >
      {!addingToExisting ? (
        <>
          <Section title="Sponsor" plain>
            <View style={styles.form}>
              <Input
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="ABC Electricals"
                autoCapitalize="words"
                autoFocus
              />
              <FilterChips
                label="Type"
                value={sponsorType}
                options={SPONSOR_TYPES}
                onChange={setSponsorType}
              />
            </View>
          </Section>

          <Section title="Logo or photo" plain>
            <GaneshImageUploader
              title="Sponsor photo"
              kind="photo"
              status={photoStatus}
              previewUri={photo?.uri}
              disabled={busy}
              onPrepared={(file) => {
                setPhoto(file);
                setPhotoStatus("selected");
              }}
              onRemove={() => {
                setPhoto(null);
                setPhotoStatus("idle");
              }}
              onRetry={() => {
                if (!savedId || !photo) return;
                setBusy(true);
                void persistPhoto(savedId, photo)
                  .then((ok) => {
                    if (ok) back();
                  })
                  .finally(() => setBusy(false));
              }}
            />
          </Section>
        </>
      ) : null}

      <Section title="The deal" subtitle={festival?.name}>
        <View style={styles.form}>
          <FilterChips
            label="What they are giving"
            value={dealType}
            options={SPONSORING_TYPES}
            onChange={setDealType}
          />
          <FilterChips
            label="Purpose"
            value={purpose}
            options={SPONSORSHIP_PURPOSES}
            onChange={setPurpose}
          />
          {purpose === "other" ? (
            <Input label="Purpose label" value={purposeLabel} onChangeText={setPurposeLabel} />
          ) : null}
          <FilterChips
            label="Status"
            value={status}
            options={statusOptions}
            onChange={setStatus}
            disabledIds={dealType === "expense" ? ["received"] : undefined}
          />

          {isCashDeal ? (
            <Input
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
            />
          ) : (
            <Input
              label="Estimated value"
              value={estimatedValue}
              onChangeText={setEstimatedValue}
              keyboardType="numeric"
              placeholder="0"
            />
          )}

          {dealType === "item" ? (
            <>
              <Input
                label="Item"
                value={itemName}
                onChangeText={setItemName}
                placeholder="LED par lights"
              />
              <Input
                label="Quantity (optional)"
                value={quantity}
                onChangeText={setQuantity}
              />
            </>
          ) : null}

          {dealType === "service" ? (
            <Input
              label="Service"
              value={serviceDescription}
              onChangeText={setServiceDescription}
              placeholder="Sound system for 3 days"
            />
          ) : null}

          {status === "promised" || status === "confirmed" ? (
            <Input
              label="Expected date (optional)"
              value={expectedDate}
              onChangeText={setExpectedDate}
              placeholder="YYYY-MM-DD"
            />
          ) : null}

          {dealType === "expense" ? (
            <StatusStrip
              tone="muted"
              message="Expense sponsorship is not income. Link it from Add expense when you record the spend."
            />
          ) : null}

          {cashReceive ? (
            <FilterChips
              label="Payment method"
              value={paymentMethod}
              options={PAYMENT_OPTIONS}
              onChange={setPaymentMethod}
            />
          ) : null}
        </View>
      </Section>

      {canLinkAsset ? (
        <Section
          title="Pandal asset"
          subtitle="Adds inventory only. This does not create an expense or change cash."
        >
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
          </View>
        </Section>
      ) : null}

      <MoreDetails filledCount={addingToExisting ? (dealNotes.trim() ? 1 : 0) : optionalFilled}>
        {!addingToExisting ? (
          <>
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
            <Input label="Sponsor notes" value={notes} onChangeText={setNotes} />
          </>
        ) : null}
        <Input label="Deal notes" value={dealNotes} onChangeText={setDealNotes} />
      </MoreDetails>
    </FormShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
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
});
