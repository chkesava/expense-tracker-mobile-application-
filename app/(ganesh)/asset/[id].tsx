import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, Package, Receipt } from "lucide-react-native";

import { GaneshImageUploader } from "@/components/ganesh/GaneshImageUploader";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { PendingHint } from "@/components/ganesh/GaneshSyncChip";
import {
  FilterChips,
  GaneshHeader,
  ListStateView,
  MetaLabel,
  Money,
  Section,
  StatTile,
  StatusBadge,
  StatusStrip,
  useGaneshTokens,
  GaneshEmptyState,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshExpense } from "@/hooks/useGaneshExpenses";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { pickerStatus, useGaneshPhotoUpload } from "@/hooks/useGaneshPhotoUpload";
import { useGaneshStorage } from "@/hooks/useGaneshStorage";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalMembers } from "@/hooks/usePandalMembers";
import { usePandalAsset, usePandalAssetAuditsFor } from "@/hooks/usePandalAssets";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { ganeshStoredPath } from "@/services/ganesh/storage/storageService";
import type { PreparedGaneshImage } from "@/services/ganesh/storage/storageTypes";
import type { AssetStatus } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_OWNERSHIP,
  ASSET_UNITS,
  assetConditionLabel,
  assetOwnershipLabel,
  assetStatusLabel,
  assetUnitLabel,
} from "@/shared/utils/ganeshAssets";
import { formatGaneshWhen, memberDisplayName } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

/** Asset status → badge tone. Wording always accompanies the colour (§35). */
function statusBadgeKind(status: AssetStatus) {
  switch (status) {
    case "available":
      return "received" as const;
    case "in_use":
      return "sponsored" as const;
    case "damaged":
      return "pending" as const;
    default:
      return "cancelled" as const;
  }
}

/** Audit action keys are snake_case in Firestore — render them as prose. */
function auditActionLabel(action: string): string {
  const spaced = action.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function AssetDetailScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pandalId } = useGaneshSession();

  const { festivals } = useFestivals(pandalId);
  // Read by id, and query the history per asset (GS-095, GS-067). Resolving
  // from the capped Pandal-wide lists told the user an existing asset belonged
  // to another Pandal, and showed an empty history for anything older than the
  // most recent 80 asset events.
  const { asset, loading: assetLoading } = usePandalAsset(pandalId, id ?? null);
  const { audits } = usePandalAssetAuditsFor(pandalId, id ?? null);
  const { members } = usePandalMembers(pandalId);
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const { isOnline, signedUrl } = useGaneshStorage();
  const photoUpload = useGaneshPhotoUpload("assetPhoto");


  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof ASSET_CATEGORIES)[number]["id"]>("furniture");
  const [unit, setUnit] = useState<(typeof ASSET_UNITS)[number]["id"]>("pieces");
  const [ownership, setOwnership] = useState<(typeof ASSET_OWNERSHIP)[number]["id"]>("purchased");
  const [condition, setCondition] = useState<(typeof ASSET_CONDITIONS)[number]["id"]>("good");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [qtyReason, setQtyReason] = useState("");
  const [disposeReason, setDisposeReason] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [photo, setPhoto] = useState<PreparedGaneshImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const photoJob = photoUpload.jobFor(asset?.id);
  /**
   * Queue a replacement photo (GS-040).
   *
   * The previous object is not deleted here: `attachAssetPhoto` reports the
   * path it replaced once the write is acknowledged, and the queue reclaims it
   * then. Deleting up front would strand the asset with no photo at all if the
   * new one never uploaded.
   */
  const queuePhoto = async (file: PreparedGaneshImage) => {
    if (!asset?.id) return;
    try {
      await photoUpload.queue(asset.id, file);
    } catch (error) {
      logError("ganesh.assetPhotoQueue", error);
      toast.error(friendlyErrorMessage(error, "Could not save that photo for upload."));
    }
  };

  const photoPath = ganeshStoredPath(asset?.photo);
  const relatedFestivalId = asset?.relatedExpenseFestivalId ?? null;
  const { expense: relatedExpense } = useGaneshExpense(
    pandalId,
    relatedFestivalId,
    asset?.relatedExpenseId ?? null
  );
  const purchaseFestival = festivals.find((item) => item.id === relatedFestivalId);

  const recentAudits = useMemo(
    () => audits.slice(0, 12),
    [audits]
  );

  useEffect(() => {
    if (!asset) return;
    setName(asset.name);
    setCategory(asset.category);
    setUnit(asset.unit);
    setOwnership(asset.ownershipType);
    setCondition(asset.condition);
    setEstimatedValue(asset.estimatedValue != null ? String(asset.estimatedValue) : "");
    setLocation(asset.location ?? "");
    setDescription(asset.description ?? "");
    setSourceName(asset.sourceName ?? "");
    setQuantity(String(asset.quantity));
    setDisposeReason(asset.disposeReason ?? "");
  }, [asset?.id, asset?.updatedAt?.seconds]);

  useEffect(() => {
    if (!photoPath || !pandalId) {
      setPhotoUrl(undefined);
      return;
    }
    let cancelled = false;
    signedUrl(photoPath)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [pandalId, photoPath, signedUrl]);

  if (!can("assets.read")) {
    return <GaneshWriteLock message="Your role cannot view Pandal assets." />;
  }

  // The asset now arrives from its own query rather than out of an
  // already-loaded list, so the first render has no asset yet. Without this
  // gate the screen would flash "Asset not found" on every open.
  if (!asset) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Asset"
          icon={<Package size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        {assetLoading ? (
          <ListStateView loading title="Loading the asset" skeletonCount={3} />
        ) : (
          <GaneshEmptyState
            icon={<Package size={22} color={g.saffron} strokeWidth={2.2} />}
            title="Asset not found"
            description="It may have been removed, or it belongs to another Pandal."
          />
        )}
      </GaneshScreen>
    );
  }

  const canEdit = can("assets.update") && asset.status !== "disposed";
  const canDispose = can("assets.dispose") && asset.status !== "disposed";

  const run = (work: Promise<unknown>, fallback: string) => {
    setBusy(true);
    work
      .catch((error) => {
        logError("ganesh.assetDetail", error);
        toast.error(friendlyErrorMessage(error, fallback));
      })
      .finally(() => setBusy(false));
  };

  const sourcePrefix =
    asset.ownershipType === "sponsored"
      ? "Sponsored by "
      : asset.ownershipType === "donated"
        ? "Donated by "
        : "";

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title={asset.name}
        subtitle={`${asset.quantity} ${assetUnitLabel(asset.unit, asset.quantity)}`}
        icon={<Package size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        rightElement={
          <StatusBadge kind={statusBadgeKind(asset.status)} label={assetStatusLabel(asset.status)} />
        }
      />

      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          accessibilityLabel={`Photo of ${asset.name}`}
          style={[styles.photo, { backgroundColor: g.tile }]}
        />
      ) : null}

      <PendingHint pending={asset.pendingWrite} />

      <Section title="Details">
        <View style={styles.statRow}>
          <StatTile label="Quantity">
            <Text
              style={[
                styles.count,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {asset.quantity}
            </Text>
          </StatTile>
          <StatTile label="Condition">
            <Text
              style={[
                styles.textValue,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {assetConditionLabel(asset.condition)}
            </Text>
          </StatTile>
          <StatTile
            label={asset.ownershipType === "purchased" ? "Paid" : "Estimated worth"}
          >
            <Money
              value={
                asset.ownershipType === "purchased" && asset.acquisitionCost != null
                  ? asset.acquisitionCost
                  : asset.estimatedValue
              }
              size="primary"
              numberOfLines={1}
              adjustsFontSizeToFit
            />
          </StatTile>
        </View>

        <View style={styles.factList}>
          <Fact label="Ownership" value={assetOwnershipLabel(asset.ownershipType)} />
          {asset.sourceName ? (
            <Fact label="Source" value={`${sourcePrefix}${asset.sourceName}`} />
          ) : null}
          {asset.location ? <Fact label="Stored at" value={asset.location} /> : null}
          {asset.ownershipType === "purchased"
          && asset.acquisitionCost != null
          && asset.estimatedValue > 0 ? (
            <Fact label="Estimated worth now" value={formatInr(asset.estimatedValue)} />
          ) : null}
          {asset.ownershipType === "purchased" && purchaseFestival ? (
            <Fact label="Bought during" value={purchaseFestival.name} />
          ) : null}
          <Fact
            label="Added by"
            value={`${memberDisplayName(members, asset.createdBy)}${
              asset.createdAt ? ` · ${formatGaneshWhen(asset.createdAt)}` : ""
            }`}
          />
          {asset.description ? <Fact label="Notes" value={asset.description} /> : null}
          {asset.disposeReason ? <Fact label="Reason" value={asset.disposeReason} /> : null}
        </View>
      </Section>

      {relatedExpense || asset.relatedExpenseId || asset.relatedContributionId ? (
        <Section title="Linked records">
          {relatedExpense ? (
            <LinkRow
              icon={<Receipt size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              title={relatedExpense.name}
              meta={`Expense · ${formatInr(relatedExpense.totalAmount)}`}
              divider={Boolean(asset.relatedContributionId)}
              onPress={() =>
                push(
                  `/(ganesh)/expense/${relatedExpense.id}?festivalId=${relatedFestivalId ?? ""}`
                )
              }
            />
          ) : asset.relatedExpenseId ? (
            <StatusStrip tone="muted" message="Linked to a festival expense." />
          ) : null}
          {asset.relatedContributionId ? (
            <LinkRow
              icon={<Package size={17} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              title="Related contribution"
              meta="This item came in as a contribution"
              onPress={() =>
                push(`/(ganesh)/contribution/${asset.relatedContributionId}`)
              }
            />
          ) : null}
        </Section>
      ) : null}

      {canEdit ? (
        editing ? (
          <>
            <Section title="Edit details">
              <View style={styles.form}>
                <Input label="Name" value={name} onChangeText={setName} />
                <FilterChips
                  label="Category"
                  value={category}
                  options={ASSET_CATEGORIES}
                  onChange={setCategory}
                />
                <FilterChips label="Unit" value={unit} options={ASSET_UNITS} onChange={setUnit} />
                <FilterChips
                  label="Ownership"
                  value={ownership}
                  options={ASSET_OWNERSHIP}
                  onChange={setOwnership}
                />
                {ownership === "donated"
                || ownership === "sponsored"
                || ownership === "transferred"
                || ownership === "other" ? (
                  <Input label="Source note" value={sourceName} onChangeText={setSourceName} />
                ) : null}
                <FilterChips
                  label="Condition"
                  value={condition}
                  options={ASSET_CONDITIONS}
                  onChange={setCondition}
                />
                <Input
                  label="Estimated value"
                  value={estimatedValue}
                  onChangeText={setEstimatedValue}
                  keyboardType="numeric"
                />
                <Input label="Location" value={location} onChangeText={setLocation} />
                <Input label="Description" value={description} onChangeText={setDescription} />
                <Button
                  loading={busy}
                  onPress={() =>
                    run(
                      writes.updatePandalAsset(asset.id, {
                        name,
                        category,
                        unit,
                        ownershipType: ownership,
                        condition,
                        estimatedValue: estimatedValue.trim() ? Number(estimatedValue) : 0,
                        location,
                        description,
                        sourceName,
                      }),
                      "Could not update asset."
                    )
                  }
                >
                  Save details
                </Button>
                <Button variant="ghost" onPress={() => setEditing(false)}>
                  Done editing
                </Button>
              </View>
            </Section>

            <Section
              title="Change quantity"
              subtitle="Every change is recorded with its reason. Setting zero disposes the item."
            >
              <View style={styles.form}>
                <Input
                  label="Quantity"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                />
                <Input
                  label="Reason"
                  value={qtyReason}
                  onChangeText={setQtyReason}
                  placeholder="Broken, extra stock, count correction"
                />
                <Button
                  variant="outline"
                  loading={busy}
                  disabled={!qtyReason.trim()}
                  onPress={() =>
                    run(
                      writes.adjustAssetQuantity(asset.id, {
                        newQuantity: Number(quantity),
                        reason: qtyReason,
                        status: Number(quantity) === 0 ? "disposed" : undefined,
                      }),
                      "Could not change quantity."
                    )
                  }
                >
                  Update quantity
                </Button>
              </View>
            </Section>

            {can("assets.create") || can("assets.update") ? (
              <Section title="Photo">
                <GaneshImageUploader
                  title="Replace photo"
                  kind="photo"
                  status={pickerStatus({
                    job: photoJob,
                    hasSelection: Boolean(photo),
                    // The asset already exists, so a picked photo with no job
                    // can only mean the enqueue failed.
                    recordSaved: true,
                    busy,
                  })}
                  previewUri={photo?.uri}
                  // No longer gated on connectivity (GS-040): the record is
                  // already saved, so the photo can be queued offline and will
                  // upload when the connection returns.
                  disabled={busy}
                  onPrepared={(file) => {
                    setPhoto(file);
                    setBusy(true);
                    void queuePhoto(file).finally(() => setBusy(false));
                  }}
                  onRemove={() => {
                    setPhoto(null);
                    if (asset.id) void photoUpload.cancel(asset.id);
                  }}
                  onRetry={() => {
                    setBusy(true);
                    const again = photoJob
                      ? photoUpload.retry(asset.id)
                      : photo
                        ? queuePhoto(photo)
                        : Promise.resolve();
                    void again.finally(() => setBusy(false));
                  }}
                />
                {!isOnline ? (
                  <StatusStrip
                    tone="muted"
                    message="Offline — a photo you add now uploads once you are back online."
                  />
                ) : null}
              </Section>
            ) : null}
          </>
        ) : (
          <Button variant="outline" onPress={() => setEditing(true)}>
            Edit asset
          </Button>
        )
      ) : null}

      {canDispose ? (
        <Section
          title="Retire this item"
          subtitle="It stays in history and never changes cash."
        >
          <View style={styles.form}>
            <Input
              label="Reason"
              value={disposeReason}
              onChangeText={setDisposeReason}
              placeholder="Broken beyond repair"
            />
            <View style={styles.actionRow}>
              <Button
                variant="outline"
                style={styles.actionButton}
                loading={busy}
                onPress={() => {
                  Alert.alert(
                    "Mark as lost?",
                    "The item stays in history. This does not change cash.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Mark lost",
                        style: "destructive",
                        onPress: () =>
                          run(
                            writes.setAssetStatus(asset.id, {
                              status: "lost",
                              reason: disposeReason,
                            }),
                            "Could not update status."
                          ),
                      },
                    ]
                  );
                }}
              >
                Mark lost
              </Button>
              <Button
                variant="outline"
                style={styles.actionButton}
                loading={busy}
                onPress={() => {
                  Alert.alert(
                    "Dispose this item?",
                    "It stays in history and is hidden from the active list.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Dispose",
                        style: "destructive",
                        onPress: () =>
                          run(
                            writes.setAssetStatus(asset.id, {
                              status: "disposed",
                              reason: disposeReason,
                            }),
                            "Could not dispose asset."
                          ),
                      },
                    ]
                  );
                }}
              >
                Dispose
              </Button>
            </View>
          </View>
        </Section>
      ) : null}

      <Section title="Recent activity" subtitle={`${recentAudits.length} recorded`}>
        {recentAudits.length === 0 ? (
          <Text
            style={[
              styles.emptyText,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
            ]}
          >
            No changes recorded yet.
          </Text>
        ) : (
          recentAudits.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.auditRow,
                index < recentAudits.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: g.divider,
                },
              ]}
            >
              <Text
                style={[
                  styles.auditTitle,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
                ]}
              >
                {auditActionLabel(item.action)}
              </Text>
              <MetaLabel>
                {memberDisplayName(members, item.actorId)}
                {item.at ? ` · ${formatGaneshWhen(item.at)}` : ""}
              </MetaLabel>
              {item.reason ? (
                <Text
                  style={[
                    styles.auditReason,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                  ]}
                >
                  {item.reason}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Section>
    </GaneshScreen>
  );
}

/** Label / value pair for a detail block. */
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
  photo: {
    width: "100%",
    height: 200,
    borderRadius: 20,
    borderCurve: "continuous",
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  count: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  textValue: {
    fontSize: 15,
    letterSpacing: -0.1,
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
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
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
  auditRow: {
    paddingVertical: 10,
    gap: 2,
  },
  auditTitle: {
    fontSize: 13.5,
  },
  auditReason: {
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
});
