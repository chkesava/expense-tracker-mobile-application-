import type {
  GaneshDocumentCategory,
  GaneshDocumentEntityType,
  GaneshDocumentStatus,
  PandalDocument,
} from "@/shared/types/ganesh";

export const DOCUMENT_CATEGORIES: { id: GaneshDocumentCategory; label: string }[] = [
  { id: "festival_document", label: "Festival document" },
  { id: "expense_receipt", label: "Expense receipt" },
  { id: "contribution_photo", label: "Contribution photo" },
  { id: "asset_photo", label: "Asset photo" },
  { id: "sponsor_photo", label: "Sponsor photo" },
  { id: "invoice", label: "Invoice" },
  { id: "quotation", label: "Quotation" },
  { id: "sponsorship_document", label: "Sponsorship document" },
  { id: "other", label: "Other" },
];

export function documentCategoryLabel(category: GaneshDocumentCategory): string {
  return DOCUMENT_CATEGORIES.find((row) => row.id === category)?.label ?? category;
}

export function documentEntityLabel(entityType: GaneshDocumentEntityType): string {
  switch (entityType) {
    case "expense":
      return "Expense";
    case "contribution":
      return "Contribution";
    case "sponsor":
      return "Sponsor";
    case "asset":
      return "Asset";
    case "festival":
      return "Festival";
    case "pandal":
      return "Pandal";
    default:
      return "Other";
  }
}

export function documentStatusLabel(status: GaneshDocumentStatus): string {
  return status === "archived" ? "Archived" : "Active";
}

/** Deterministic vault id for one-file entity slots (receipt / photo). */
export function vaultDocumentId(
  entityType: GaneshDocumentEntityType,
  entityId: string
): string {
  return `${entityType}_${entityId}`;
}

export function validateDocumentDescription(description: string | undefined): string | undefined {
  const trimmed = description?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 500) {
    throw new Error("Description is too long.");
  }
  return trimmed;
}

export function summarizeDocuments(docs: PandalDocument[]) {
  const active = docs.filter((doc) => doc.status === "active" && Boolean(doc.storagePath));
  return {
    total: active.length,
    receipts: active.filter((doc) => doc.category === "expense_receipt").length,
    festival: active.filter((doc) => doc.category === "festival_document").length,
  };
}
