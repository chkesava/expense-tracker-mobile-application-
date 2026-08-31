import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2 } from "lucide-react-native";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalSponsor } from "@/hooks/usePandalSponsors";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { newId } from "@/lib/id";
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
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_UNITS,
} from "@/shared/utils/ganeshAssets";
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
  const [assetCategory, setAssetCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [photoStatus, setPhotoStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(existingSponsorId || null);
  const [busy, setBusy] = useState(false);
  const sponsorshipOpId = useRef(newId()).current;
  const closed = festivals.find((item) => item.id === festivalId)?.status === "closed";
  const canReceive = can("sponsors.receive");
  const canLinkAsset = can("assets.create") && dealType === "item" && status === "received";

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

  const dealValue = dealType === "cash" || dealType === "expense" ? Number(amount || 0) : Number(estimatedValue || 0);

  return (
    <GaneshScreen>
      <GaneshHeader
        title={existingSponsorId ? "Add sponsorship" : "Add sponsor"}
        icon={<Building2 size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        Prospective and promised deals do not change festival cash. In-kind is not cash.
      </Text>
      {existingSponsorId ? null : (
        <View style={{ gap: 16 }}>
          <Input label="Name" value={name} onChangeText={setName} placeholder="ABC Electricals" />
          <ChoiceChips label="Sponsor type" value={sponsorType} options={SPONSOR_TYPES} onChange={setSponsorType} />
          <FormDetails>
            <Input label="Mobile (optional)" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
            <Input label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" />
            <Input label="Address (optional)" value={address} onChangeText={setAddress} />
            <Input label="Notes (optional)" value={notes} onChangeText={setNotes} />
            <GaneshImageUploader
              title="Photo"
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
          </FormDetails>
        </View>
      )}

      <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }}>
        This festival
      </Text>
      <ChoiceChips label="What they are giving" value={dealType} options={SPONSORING_TYPES} onChange={setDealType} />
      <ChoiceChips label="Purpose" value={purpose} options={SPONSORSHIP_PURPOSES} onChange={setPurpose} />
      {purpose === "other" ? (
        <Input label="Purpose label" value={purposeLabel} onChangeText={setPurposeLabel} />
      ) : null}
      <ChoiceChips
        label="Status"
        value={status}
        options={statusOptions}
        onChange={setStatus}
        disabledIds={dealType === "expense" ? ["received"] : undefined}
      />
      {dealType === "cash" || dealType === "expense" ? (
        <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      ) : (
        <Input
          label="Estimated value"
          value={estimatedValue}
          onChangeText={setEstimatedValue}
          keyboardType="numeric"
        />
      )}
      {dealType === "item" ? (
        <>
          <Input label="Item" value={itemName} onChangeText={setItemName} placeholder="LED par lights" />
          <Input label="Quantity (optional)" value={quantity} onChangeText={setQuantity} />
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
        <Text style={{ color: theme.colors.mutedForeground }}>
          Expense sponsorship is not income. Link it when you record the spend.
        </Text>
      ) : null}
      {cashReceive ? (
        <>
          <Text style={{ color: theme.colors.mutedForeground }}>
            This adds {formatInr(dealValue)} to festival cash.
          </Text>
          <ChoiceChips
            label="Payment method"
            value={paymentMethod}
            options={PAYMENT_OPTIONS}
            onChange={setPaymentMethod}
          />
        </>
      ) : null}
      {moneyOffline ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Connect to the internet to record received cash so it is counted once.
        </Text>
      ) : null}
      <FormDetails>
      <Input label="Deal notes (optional)" value={dealNotes} onChangeText={setDealNotes} />
      {canLinkAsset ? (
        <View style={{ gap: 12 }}>
          <ChoiceChips
            label="Pandal asset"
            value={addAsAsset ? "yes" : "no"}
            options={[
              { id: "no", label: "Deal only" },
              { id: "yes", label: "Also add as Pandal asset" },
            ]}
            onChange={(next) => setAddAsAsset(next === "yes")}
          />
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
      </FormDetails>
      <Button
        loading={busy}
        disabled={closed || moneyOffline}
        onPress={() => {
          const saveDeal = (sponsorId: string) =>
            writes.addSponsorship(sponsorId, {
              clientOpId: sponsorshipOpId,
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
            if (!photo || existingSponsorId) {
              back();
              return;
            }
            const uploaded = await persistPhoto(sponsorId, photo);
            if (uploaded) back();
          };

          const work = existingSponsorId
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
        }}
      >
        {existingSponsorId ? "Save sponsorship" : "Save sponsor"}
      </Button>
    </GaneshScreen>
  );
}
