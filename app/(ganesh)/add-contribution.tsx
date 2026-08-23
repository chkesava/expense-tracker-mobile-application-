import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshImageUploader, type GaneshUploadStatus } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import type { ContributionKind, ContributionStatus } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_UNITS,
} from "@/shared/utils/ganeshAssets";
import { useTheme } from "@/theme/ThemeProvider";

const KINDS: ContributionKind[] = ["money", "item", "service", "sponsorship"];
const STATUSES: ContributionStatus[] = ["promised", "received", "cancelled"];
const PHOTO_KINDS: ContributionKind[] = ["item", "service", "sponsorship"];

export default function AddContributionScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { isOnline, uploadContributionPhoto } = useGaneshStorage();
  const [kind, setKind] = useState<ContributionKind>("item");
  const [status, setStatus] = useState<ContributionStatus>("received");
  const [contributorName, setContributorName] = useState("");
  const [mobile, setMobile] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [description, setDescription] = useState("");
  const [addAsAsset, setAddAsAsset] = useState(false);
  const [assetCategory, setAssetCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("other");
  const [assetUnit, setAssetUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [assetQty, setAssetQty] = useState("1");
  const [assetCondition, setAssetCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [assetLocation, setAssetLocation] = useState("");
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [photoStatus, setPhotoStatus] = useState<GaneshUploadStatus>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allowsPhoto = PHOTO_KINDS.includes(kind);
  const canLinkAsset = can("assets.create") && (kind === "item" || kind === "sponsorship");
  const ledgerSaved = Boolean(savedId);

  const persistPhoto = async (contributionId: string, file: PreparedGaneshImage) => {
    if (!isOnline) {
      setPhotoStatus("waiting");
      return false;
    }
    setPhotoStatus("uploading");
    try {
      await uploadContributionPhoto(contributionId, file);
      setPhotoStatus("uploaded");
      return true;
    } catch (error) {
      logError("ganesh.photoUpload", error);
      setPhotoStatus("failed");
      toast.error("Contribution saved, but photo upload failed.");
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

  if (!can("contributions.create")) {
    return <GaneshWriteLock message="Your role cannot add contributions." />;
  }

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground }}>
        Contributor is who gave the item or money. You are only recording it.
      </Text>
      <Chip
        value={kind}
        options={KINDS}
        disabled={ledgerSaved}
        onChange={(next) => {
          setKind(next);
          if (next !== "item" && next !== "sponsorship") {
            setAddAsAsset(false);
          }
          if (!PHOTO_KINDS.includes(next)) {
            setPhoto(null);
            setPhotoStatus("idle");
          }
        }}
      />
      {kind !== "money" ? (
        <Chip value={status} options={STATUSES} disabled={ledgerSaved} onChange={setStatus} />
      ) : null}
      <Input
        label="Contributor"
        value={contributorName}
        onChangeText={setContributorName}
        placeholder="Suresh Kumar"
        editable={!ledgerSaved}
      />
      <Input
        label="Mobile (optional)"
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
        editable={!ledgerSaved}
      />
      {kind !== "money" ? (
        <>
          <Input
            label="Item / service"
            value={itemName}
            onChangeText={setItemName}
            placeholder="Ganesh Idol"
            editable={!ledgerSaved}
          />
          <Input
            label="Quantity (optional)"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="1"
            editable={!ledgerSaved}
          />
          <Input
            label="Estimated value"
            value={estimatedValue}
            onChangeText={setEstimatedValue}
            keyboardType="numeric"
            editable={!ledgerSaved}
          />
        </>
      ) : (
        <Input
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          editable={!ledgerSaved}
        />
      )}
      <Input
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        editable={!ledgerSaved}
      />
      {canLinkAsset ? (
        <View style={{ gap: 12 }}>
          <Pressable
            disabled={ledgerSaved}
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
              <Text style={{ color: theme.colors.mutedForeground }}>
                Adds inventory only. This does not create an expense or change cash.
              </Text>
              <Input
                label="Asset quantity"
                value={assetQty}
                onChangeText={setAssetQty}
                keyboardType="number-pad"
                editable={!ledgerSaved}
              />
              <ChoiceChips
                label="Asset category"
                value={assetCategory}
                options={ASSET_CATEGORIES}
                onChange={setAssetCategory}
                disabled={ledgerSaved}
              />
              <ChoiceChips
                label="Unit"
                value={assetUnit}
                options={ASSET_UNITS}
                onChange={setAssetUnit}
                disabled={ledgerSaved}
              />
              <ChoiceChips
                label="Condition"
                value={assetCondition}
                options={ASSET_CONDITIONS}
                onChange={setAssetCondition}
                disabled={ledgerSaved}
              />
              <Input
                label="Location (optional)"
                value={assetLocation}
                onChangeText={setAssetLocation}
                editable={!ledgerSaved}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {allowsPhoto ? (
        <GaneshImageUploader
          title="Contribution photo"
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
      ) : null}
      <Button
        loading={busy}
        disabled={ledgerSaved}
        onPress={() => {
          if (addAsAsset && canLinkAsset) {
            const qty = Number(assetQty || quantity || 0);
            if (!Number.isInteger(qty) || qty <= 0) {
              toast.error("Asset quantity must be greater than 0.");
              return;
            }
            if (!(itemName.trim() || contributorName.trim())) {
              toast.error("Enter an item name to add as a Pandal asset.");
              return;
            }
          }
          setBusy(true);
          writes
            .addContribution({
              kind,
              contributorName,
              mobile,
              itemName,
              quantity,
              amount: Number(amount || 0),
              estimatedValue: Number(estimatedValue || 0),
              description,
              date: todayDateInput(),
              status: kind === "money" ? "received" : status,
              pandalAsset:
                addAsAsset && canLinkAsset
                  ? {
                      name: itemName.trim() || contributorName.trim(),
                      category: assetCategory,
                      quantity: Number(assetQty || quantity || 0),
                      unit: assetUnit,
                      estimatedValue: Number(estimatedValue || 0),
                      condition: assetCondition,
                      location: assetLocation,
                    }
                  : undefined,
            })
            .then(async (id) => {
              setSavedId(id);
              if (!allowsPhoto || !photo) {
                back();
                return;
              }
              const uploaded = await persistPhoto(id, photo);
              if (uploaded) back();
            })
            .catch((error) => {
              logError("ganesh.addContribution", error);
              toast.error(friendlyErrorMessage(error, "Could not save contribution."));
            })
            .finally(() => setBusy(false));
        }}
      >
        Save contribution
      </Button>
    </GaneshScreen>
  );
}

function Chip<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          key={option}
          disabled={disabled}
          onPress={() => onChange(option)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: value === option ? theme.colors.primary : theme.colors.muted,
          }}
        >
          <Text
            style={{
              color: value === option ? theme.colors.primaryForeground : theme.colors.foreground,
              fontWeight: "700",
              textTransform: "capitalize",
            }}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
