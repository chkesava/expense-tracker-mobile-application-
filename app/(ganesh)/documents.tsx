import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { FileText } from "lucide-react-native";

import { GaneshScreen, useGaneshListPadding } from "@/components/ganesh/GaneshScreen";
import { GaneshSyncChip } from "@/components/ganesh/GaneshSyncChip";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  GaneshHeader,
  LedgerRow,
  ListStateView,
  MetaLabel,
  Section,
  StatTile,
  useGaneshTokens,
  type LedgerRowBadge,
} from "@/components/ganesh/ui";
import { SearchBar } from "@/components/common/SearchBar";
import { AddFab } from "@/components/ui/AddFab";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandalDocuments } from "@/hooks/usePandalDocuments";
import { logError } from "@/lib/errors";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { GaneshDocumentCategory, PandalDocument } from "@/shared/types/ganesh";
import {
  DOCUMENT_CATEGORIES,
  documentCategoryLabel,
  documentEntityLabel,
  summarizeDocuments,
} from "@/shared/utils/ganeshDocuments";
import { useTheme } from "@/theme/ThemeProvider";

const SCOPE_OPTIONS = [
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
] as const;

type DocScope = (typeof SCOPE_OPTIONS)[number]["id"];
type CategoryFilter = "all" | GaneshDocumentCategory;

function docBadge(doc: PandalDocument): LedgerRowBadge {
  if (doc.status === "archived") {
    return { kind: "cancelled", label: "Archived" };
  }
  return { kind: "received", label: documentEntityLabel(doc.entityType) };
}

export default function DocumentVaultScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const listPadding = useGaneshListPadding(false);

  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const { documents, loading, error } = usePandalDocuments(pandalId);
  const { can, isAdmin } = useGaneshPermissions();
  const writes = useGaneshWrites();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<DocScope>("active");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [festivalFilter, setFestivalFilter] = useState<"all" | "current" | string>("all");

  useEffect(() => {
    if (!isAdmin) return;
    writes.ensurePandalRoles().catch((caught) => {
      logError("ganesh.documents.ensureRoles", caught);
    });
  }, [isAdmin, pandalId]);

  const summary = useMemo(() => summarizeDocuments(documents), [documents]);

  const festivalOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [
      { id: "all", label: "All festivals" },
    ];
    if (festivalId) options.push({ id: "current", label: "This festival" });
    for (const festival of festivals.slice(0, 6)) {
      if (options.some((row) => row.id === festival.id)) continue;
      options.push({ id: festival.id, label: festival.name });
    }
    return options;
  }, [festivalId, festivals]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (!doc.storagePath && scope !== "all") return false;
      if (scope === "active" && doc.status !== "active") return false;
      if (scope === "archived" && doc.status !== "archived") return false;
      if (category !== "all" && doc.category !== category) return false;
      if (festivalFilter === "current" && festivalId && doc.festivalId !== festivalId) {
        return false;
      }
      if (
        festivalFilter !== "all"
        && festivalFilter !== "current"
        && doc.festivalId !== festivalFilter
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        doc.fileName,
        doc.description,
        documentCategoryLabel(doc.category),
        documentEntityLabel(doc.entityType),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [category, documents, festivalFilter, festivalId, query, scope]);

  const renderItem = useCallback(
    ({ item }: { item: PandalDocument }) => {
      const festivalName = item.festivalId
        ? festivals.find((festival) => festival.id === item.festivalId)?.name
        : undefined;
      return (
        <LedgerRow
          icon={<FileText size={18} color={g.saffron} strokeWidth={2.2} />}
          title={item.description?.trim() || item.fileName || documentCategoryLabel(item.category)}
          meta={[
            documentCategoryLabel(item.category),
            festivalName,
            item.fileName || undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={docBadge(item)}
          onPress={() => push(`/(ganesh)/document/${item.id}`)}
        />
      );
    },
    [festivals, g.saffron, push]
  );

  if (!can("documents.read")) {
    return (
      <GaneshScreen safeTop>
        <GaneshHeader
          title="Document vault"
          icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
          onBack={back}
        />
        <GaneshWriteLock message="You do not have permission to view Pandal documents." />
      </GaneshScreen>
    );
  }

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Document vault"
        subtitle="Receipts, photos and festival files"
        icon={<FileText size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
        rightElement={<GaneshSyncChip />}
      />

      <Section>
        <View style={styles.stats}>
          <StatTile label="Active files">
            <Text
              style={[
                styles.statValue,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {summary.total}
            </Text>
          </StatTile>
          <StatTile label="Receipts">
            <Text
              style={[
                styles.statValue,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {summary.receipts}
            </Text>
          </StatTile>
          <StatTile label="Festival docs">
            <Text
              style={[
                styles.statValue,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
              ]}
            >
              {summary.festival}
            </Text>
          </StatTile>
        </View>
        <MetaLabel>
          Entity attachments (expense receipts, asset photos) appear here automatically. Uploading a
          file never creates a money transaction.
        </MetaLabel>
      </Section>

      <SearchBar value={query} onChangeText={setQuery} placeholder="Search documents" />
      <FilterChips
        label="Status"
        value={scope}
        options={[...SCOPE_OPTIONS]}
        onChange={setScope}
      />
      <FilterChips
        label="Category"
        value={category}
        options={[{ id: "all", label: "All" }, ...DOCUMENT_CATEGORIES]}
        onChange={(id) => setCategory(id as CategoryFilter)}
      />
      <FilterChips
        label="Festival"
        value={festivalFilter}
        options={festivalOptions}
        onChange={setFestivalFilter}
      />

      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        estimatedItemSize={72}
        contentContainerStyle={{ paddingBottom: listPadding }}
        ListEmptyComponent={
          <ListStateView
            loading={loading}
            error={error}
            title="No documents yet"
            description="Add a festival document, or attach a receipt or photo on an expense, contribution, asset or sponsor."
          />
        }
      />

      {can("documents.create") ? (
        <AddFab label="Add document" onPress={() => push("/(ganesh)/add-document")} />
      ) : null}
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  statValue: {
    fontSize: 20,
  },
});
