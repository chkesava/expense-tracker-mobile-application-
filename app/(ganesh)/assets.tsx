import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Package } from "lucide-react-native";

import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  MetaLabel,
  Money,
  Section,
  StatTile,
  useGaneshTokens,
  type LedgerRowBadge,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { AddFab } from "@/components/ui/AddFab";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalAssets } from "@/hooks/usePandalAssets";
import { logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { AssetStatus, PandalAsset } from "@/shared/types/ganesh";
import {
  ASSET_CATEGORIES,
  assetCategoryLabel,
  assetConditionLabel,
  assetOwnershipLabel,
  assetStatusLabel,
  assetUnitLabel,
  inventoryGlance,
  summarizeAssets,
} from "@/shared/utils/ganeshAssets";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

const SCOPE_OPTIONS = [
  { id: "active", label: "In store" },
  { id: "history", label: "Gone" },
  { id: "all", label: "All" },
] as const;

type AssetScope = (typeof SCOPE_OPTIONS)[number]["id"];
type CategoryFilter = "all" | (typeof ASSET_CATEGORIES)[number]["id"];

/** Asset status → badge. Each status keeps its own wording (a11y §35). */
function assetBadge(status: AssetStatus): LedgerRowBadge {
  switch (status) {
    case "available":
      return { kind: "received", label: assetStatusLabel(status) };
    case "in_use":
      return { kind: "sponsored", label: assetStatusLabel(status) };
    case "damaged":
      return { kind: "pending", label: assetStatusLabel(status) };
    case "disposed":
    case "lost":
      return { kind: "cancelled", label: assetStatusLabel(status) };
    default:
      return { kind: "neutral", label: assetStatusLabel(status) };
  }
}

export default function PandalAssetsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const listPadding = useGaneshListPadding(false);

  const { pandalId } = useGaneshSession();
  const { assets, loading, error } = usePandalAssets(pandalId);
  const { can, isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<AssetScope>("active");
  const [category, setCategory] = useState<CategoryFilter>("all");

  useEffect(() => {
    if (!isAdmin) return;
    writes.ensurePandalRoles().catch((caught) => {
      logError("ganesh.assets.ensureRoles", caught);
    });
  }, [isAdmin, pandalId]);

  const summary = useMemo(() => summarizeAssets(assets), [assets]);
  const glance = useMemo(() => inventoryGlance(assets), [assets]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (category !== "all" && asset.category !== category) return false;
      if (scope === "active" && (asset.status === "disposed" || asset.status === "lost")) {
        return false;
      }
      if (scope === "history" && asset.status !== "disposed" && asset.status !== "lost") {
        return false;
      }
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

  const canAdd = can("assets.create");
  const openAdd = useCallback(() => push("/(ganesh)/add-asset" as never), [push]);
  const onOpen = useCallback((id: string) => push(`/(ganesh)/asset/${id}` as never), [push]);

  const renderItem = useCallback(
    ({ item }: { item: PandalAsset }) => (
      <LedgerRow
        id={item.id}
        icon={<Package size={18} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
        title={item.name}
        meta={
          [
            assetCategoryLabel(item.category),
            assetConditionLabel(item.condition),
            assetOwnershipLabel(item.ownershipType),
            item.location || null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
        badges={[assetBadge(item.status)]}
        amountMeta={
          <View style={styles.assetValue}>
            <Text
              style={[
                styles.quantity,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {item.quantity} {assetUnitLabel(item.unit, item.quantity)}
            </Text>
            {item.estimatedValue > 0 ? (
              <MetaLabel>Worth {formatInr(item.estimatedValue)}</MetaLabel>
            ) : item.ownershipType === "purchased" && item.acquisitionCost != null ? (
              <MetaLabel>Paid {formatInr(item.acquisitionCost)}</MetaLabel>
            ) : null}
          </View>
        }
        pending={item.pendingWrite}
        onPress={onOpen}
      />
    ),
    [onOpen, theme.colors.foreground, theme.colors.mutedForeground, theme.fontFamily.semibold]
  );

  if (!can("assets.read")) {
    return <GaneshWriteLock message="Your role cannot view Pandal assets." />;
  }

  return (
    <GaneshScreen
      safeTop
      scroll={false}
      overlay={
        canAdd ? (
          <View style={[styles.fab, { bottom: listPadding - 16 }]} pointerEvents="box-none">
            <AddFab onPress={openAdd} accessibilityLabel="Add asset" size="lg" />
          </View>
        ) : null
      }
    >
      <GaneshHeader
        title="Pandal assets"
        subtitle={`${summary.totalItems} item${summary.totalItems === 1 ? "" : "s"}`}
        icon={<Package size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        rightElement={<GaneshSyncChip />}
      />

      {glance.byCategory.length > 0 ? (
        <Section title="In store" subtitle="What the Pandal owns" plain rule={false}>
          <View style={styles.categories}>
            {glance.byCategory.map((row) => (
              <View
                key={row.id}
                style={[styles.categoryChip, { backgroundColor: g.tile, borderColor: g.divider }]}
              >
                <Text
                  style={[
                    styles.categoryQty,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                  ]}
                >
                  {row.quantity}
                </Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  {row.label}
                </Text>
              </View>
            ))}
          </View>
          {glance.byCondition.length > 0 ? (
            <MetaLabel numberOfLines={2}>
              {glance.byCondition.map((row) => `${row.label} ${row.quantity}`).join(" · ")}
            </MetaLabel>
          ) : null}
        </Section>
      ) : null}

      <View style={styles.statRow}>
        <StatTile label="Available">
          <Text
            style={[
              styles.count,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            {summary.available}
          </Text>
        </StatTile>
        <StatTile
          label="Needs replacing"
          meta={
            glance.needsReplacing > 0 ? (
              <Text
                style={[
                  styles.tileMeta,
                  { color: theme.colors.warning, fontFamily: theme.fontFamily.medium },
                ]}
              >
                Damaged or unusable
              </Text>
            ) : (
              <Text
                style={[
                  styles.tileMeta,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                Store is sound
              </Text>
            )
          }
        >
          <Text
            style={[
              styles.count,
              {
                color: glance.needsReplacing > 0 ? theme.colors.warning : theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            {glance.needsReplacing}
          </Text>
        </StatTile>
        <StatTile label="Estimated worth">
          <Money
            value={summary.estimatedValue}
            size="primary"
            numberOfLines={1}
            adjustsFontSizeToFit
          />
        </StatTile>
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, category, or location"
      />

      <FilterChips value={scope} options={[...SCOPE_OPTIONS]} onChange={setScope} />
      <FilterChips
        value={category}
        options={[{ id: "all" as const, label: "All categories" }, ...ASSET_CATEGORIES]}
        onChange={setCategory}
      />

      <FlashList
        data={rows}
        style={styles.list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: listPadding }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <ListStateView
            loading={loading && assets.length === 0}
            error={error}
            illustration="vaults"
            title={
              query.trim() || category !== "all" || scope !== "active"
                ? "Nothing matches"
                : "No Pandal assets yet"
            }
            description={
              query.trim() || category !== "all" || scope !== "active"
                ? "Try another category, or switch to All."
                : "Add reusable items such as chairs, speakers and lights. They stay with the Pandal every year."
            }
            action={
              canAdd && !query.trim() && category === "all" && scope === "active"
                ? { label: "Add asset", onPress: openAdd }
                : undefined
            }
          />
        }
      />
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  separator: {
    height: 10,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  tileMeta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  count: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  assetValue: {
    alignItems: "flex-end",
    gap: 1,
  },
  quantity: {
    fontSize: 14,
    letterSpacing: -0.1,
    fontVariant: ["tabular-nums"],
  },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  categoryQty: {
    fontSize: 17,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  categoryLabel: {
    fontSize: 11.5,
  },
  fab: {
    position: "absolute",
    right: 16,
  },
});
