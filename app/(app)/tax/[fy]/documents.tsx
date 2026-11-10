import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { FolderLock, Plus } from "lucide-react-native";

import { ActionMenuSheet, type ActionMenuItem } from "@/components/common/ActionMenuSheet";
import { Dialog } from "@/components/common/Dialog";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageListStateScroll } from "@/components/layout/PageListStateScroll";
import { PageShell } from "@/components/layout/PageShell";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { TaxDocumentRow } from "@/components/tax/TaxDocumentRow";
import { TaxDocumentSheet, type TaxDocumentSheetMode } from "@/components/tax/TaxDocumentSheet";
import { DocumentViewerModal } from "@/components/documents";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { Button } from "@/components/ui/Button";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useTaxDocumentActions } from "@/hooks/useTaxDocumentActions";
import { useTaxDocuments } from "@/hooks/useTaxData";
import { useNetwork } from "@/providers/NetworkProvider";
import type { TaxDocument } from "@/shared/features/tax/types";
import { groupTaxDocuments } from "@/shared/features/tax/utils/documents";
import { isFinancialYearKey, taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { useTheme } from "@/theme/ThemeProvider";

type Row = { type: "header"; key: string; title: string; count: number } | { type: "doc"; key: string; document: TaxDocument };

/**
 * Tax documents for one financial year (SPENDLY-298): Form 16, AIS, 26AS,
 * proofs, certificates, statements and receipts, grouped by kind.
 *
 * Files sit in the private `spendly-files` bucket and open through a link
 * that lasts five minutes. They are removed with the account (SPENDLY-711).
 * Reads one year of metadata only while this screen is open (SPENDLY-406).
 */
export default function TaxDocumentsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { fy: param } = useLocalSearchParams<{ fy: string }>();
  const fy = typeof param === "string" && isFinancialYearKey(param) ? param : "";
  const { enabled, loading: flagLoading } = useTaxCenterFlag();
  const { isOnline } = useNetwork();
  const { documents, loading, error, retry } = useTaxDocuments(fy, { enabled: enabled && !!fy });
  const actions = useTaxDocumentActions(fy);

  const [sheet, setSheet] = useState<TaxDocumentSheetMode | null>(null);
  const [menuFor, setMenuFor] = useState<TaxDocument | null>(null);
  const [deleting, setDeleting] = useState<TaxDocument | null>(null);
  const [viewingDocument, setViewingDocument] = useState<TaxDocument | null>(null);
  const nowMs = Date.now();

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const group of groupTaxDocuments(documents)) {
      out.push({ type: "header", key: `h:${group.category}`, title: group.title, count: group.documents.length });
      for (const document of group.documents) out.push({ type: "doc", key: document.id, document });
    }
    return out;
  }, [documents]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.type === "doc" ? (
        <TaxDocumentRow document={item.document} nowMs={nowMs} onPress={setMenuFor} />
      ) : (
        <Text
          accessibilityRole="header"
          style={{
            paddingHorizontal: theme.space.lg,
            paddingTop: theme.space.lg,
            paddingBottom: theme.space.xs,
            color: theme.colors.foreground,
            fontFamily: theme.fontFamily.semibold,
            fontSize: theme.typography.md,
          }}
        >
          {item.title} <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }}>({item.count})</Text>
        </Text>
      ),
    [nowMs, theme]
  );

  if (!enabled || !fy) {
    if (flagLoading) return <PageShell scrollable={false}><LoadingState variant="spinner" /></PageShell>;
    return <Redirect href={"/tax" as Href} />;
  }

  const menu: ActionMenuItem[] = !menuFor
    ? []
    : menuFor.status === "pending"
      ? [
          { label: "Retry upload", disabled: !isOnline, disabledReason: isOnline ? undefined : "You're offline.", onPress: () => (setSheet({ kind: "retry", document: menuFor }), setMenuFor(null)) },
          { label: "Remove", destructive: true, onPress: () => (setDeleting(menuFor), setMenuFor(null)) },
        ]
      : [
          { label: "View", disabled: !isOnline, disabledReason: isOnline ? undefined : "You're offline.", onPress: () => (setViewingDocument(menuFor), setMenuFor(null)) },
          { label: "Edit name or kind", onPress: () => (setSheet({ kind: "edit", document: menuFor }), setMenuFor(null)) },
          { label: "Delete", destructive: true, onPress: () => (setDeleting(menuFor), setMenuFor(null)) },
        ];

  const header = (
    <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingBottom: theme.space.sm }}>
      {!isOnline ? <TaxNotice tone="offline">You're offline. Documents can't be uploaded or opened until you're back online.</TaxNotice> : null}
      <TaxNotice>
        Stored privately for your account only, and deleted with your account. Spendly doesn't read what's inside.
      </TaxNotice>
    </View>
  );

  let body;
  if (error) {
    body = (
      <PageListStateScroll>
        <ErrorState title="Couldn't load your documents" description={error.message} onRetry={error.retryable ? retry : undefined} />
      </PageListStateScroll>
    );
  } else if (loading) {
    body = <LoadingState variant="list" count={4} label="Loading your documents…" />;
  } else if (rows.length === 0) {
    body = (
      <PageListStateScroll>
        <EmptyState
          illustration="analytics"
          title="No documents for this year yet"
          description="Keep your Form 16, AIS, 26AS, investment proofs and tax payment receipts here, so everything for the year is in one place."
          primaryAction={{ label: "Add document", onPress: () => setSheet({ kind: "add" }) }}
        />
      </PageListStateScroll>
    );
  } else {
    body = <DocumentList rows={rows} renderItem={renderItem} header={header} />;
  }

  return (
    <PageShell scrollable={false} listOwnsBottomInset>
      <PageHeader
        title="Documents"
        subtitle={taxYearLabel(fy)}
        icon={<FolderLock size={20} color={theme.colors.primary} />}
        onBack={() => router.back()}
        rightElement={
          <Button variant="ghost" size="icon" onPress={() => setSheet({ kind: "add" })} accessibilityLabel="Add document" disabled={!isOnline}>
            <Plus size={20} color={theme.colors.primary} />
          </Button>
        }
      />
      {body}

      <ActionMenuSheet isOpen={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.name ?? ""} actions={menu} />
      <TaxDocumentSheet
        mode={sheet}
        busy={actions.busy}
        onAdd={actions.add}
        onEdit={actions.edit}
        onRetry={actions.retry}
        onClose={() => setSheet(null)}
      />
      <Dialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting?.status === "pending" ? "Remove this unfinished upload?" : "Delete this document?"}
        description="The file is deleted and removed from any tax record it was attached to. This can't be undone."
        actions={[
          { label: "Cancel", variant: "ghost", onPress: () => setDeleting(null) },
          {
            label: "Delete",
            variant: "destructive",
            loading: actions.busy,
            onPress: () => {
              const document = deleting;
              setDeleting(null);
              if (document) void actions.remove(document);
            },
          },
        ]}
      />

      <DocumentViewerModal
        visible={viewingDocument !== null}
        document={viewingDocument}
        onClose={() => setViewingDocument(null)}
      />
    </PageShell>
  );
}

function DocumentList({
  rows,
  renderItem,
  header,
}: {
  rows: Row[];
  renderItem: ({ item }: { item: Row }) => React.ReactElement;
  header: React.ReactElement;
}) {
  const bottomPadding = usePageListBottomPadding();
  return (
    <View style={styles.listWrap}>
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
});
