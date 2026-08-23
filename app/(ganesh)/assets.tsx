import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";

import { EmptyState } from "@/components/common/EmptyState";
import { ChoiceChips } from "@/components/ganesh/ChoiceChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip, PendingHint } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { AddFab } from "@/components/ui/AddFab";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import {
  ASSET_CATEGORIES,
  assetCategoryLabel,
  assetConditionLabel,
  assetOwnershipLabel,
  assetStatusLabel,
  assetUnitLabel,
} from "@/shared/utils/ganeshAssets";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const SCOPE_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "history", label: "History" },
  { id: "all", label: "All" },
] as const;

type AssetScope = (typeof SCOPE_OPTIONS)[number]["id"];

const AssetCard = memo(function AssetCard({
  id,
  name,
  qtyLabel,
  meta,
  pending,
  onOpen,
}: {
  id: string;
  name: string;
  qtyLabel: string;
  meta: string;
  pending?: boolean;
  onOpen: (id: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => onOpen(id)}
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        gap: 4,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{name}</Text>
      <Text style={{ color: theme.colors.primary, fontWeight: "800" }}>{qtyLabel}</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>{meta}</Text>
      <PendingHint pending={pending} />
    </Pressable>
  );
});

export default function PandalAssetsScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId } = useGaneshSession();
  const { assets, loading } = usePandalAssets(pandalId);
  const { can, isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<AssetScope>("active");
  const [category, setCategory] = useState<"all" | (typeof ASSET_CATEGORIES)[number]["id"]>("all");

  useEffect(() => {
    if (!isAdmin) return;
    writes.ensurePandalRoles().catch((error) => {
      logError("ganesh.assets.ensureRoles", error);
    });
  }, [isAdmin, pandalId]);

  const onOpen = useCallback(
    (id: string) => {
      push(`/(ganesh)/asset/${id}` as never);
    },
    [push]
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (category !== "all" && asset.category !== category) return false;
      if (scope === "active" && (asset.status === "disposed" || asset.status === "lost")) return false;
      if (scope === "history" && asset.status !== "disposed" && asset.status !== "lost") return false;
      if (!needle) return true;
      const haystack = [
        asset.name,
        assetCategoryLabel(asset.category),
        asset.location ?? "",
        asset.sourceName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [assets, category, query, scope]);

  if (!can("assets.read")) {
    return <GaneshWriteLock message="Your role cannot view Pandal assets." />;
  }

  return (
    <GaneshScreen scroll={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "800" }}>
          Pandal assets
        </Text>
        <GaneshSyncChip />
      </View>
      <Input
        label="Search"
        value={query}
        onChangeText={setQuery}
        placeholder="Name, category, or location"
      />
      <ChoiceChips
        value={scope}
        options={[...SCOPE_OPTIONS]}
        onChange={setScope}
      />
      <ChoiceChips
        value={category}
        options={[{ id: "all", label: "All" }, ...ASSET_CATEGORIES]}
        onChange={setCategory}
      />
      <FlashList
        data={rows}
        style={{ flex: 1 }}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => (
          <AssetCard
            id={item.id}
            name={item.name}
            qtyLabel={`${item.quantity} ${assetUnitLabel(item.unit, item.quantity)}`}
            meta={[
              assetOwnershipLabel(item.ownershipType),
              assetCategoryLabel(item.category),
              assetConditionLabel(item.condition),
              assetStatusLabel(item.status),
              item.ownershipType === "purchased" && item.acquisitionCost != null
                ? `Paid ${formatInr(item.acquisitionCost)}`
                : null,
              item.estimatedValue > 0 ? `Worth ${formatInr(item.estimatedValue)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            pending={item.pendingWrite}
            onOpen={onOpen}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <Text style={{ color: theme.colors.mutedForeground }}>Loading assets…</Text>
          ) : (
            <EmptyState
              title="Nothing in the Pandal store yet"
              description="Add chairs, speakers, and other items. They stay with the Pandal every year."
              primaryAction={
                can("assets.create")
                  ? {
                      label: "Add asset",
                      onPress: () => push("/(ganesh)/add-asset" as never),
                    }
                  : undefined
              }
            />
          )
        }
      />
      {can("assets.create") && rows.length > 0 ? (
        <AddFab
          onPress={() => push("/(ganesh)/add-asset" as never)}
          accessibilityLabel="Add asset"
        />
      ) : null}
    </GaneshScreen>
  );
}
