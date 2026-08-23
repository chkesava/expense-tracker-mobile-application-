import type {
  AssetCategory,
  AssetCondition,
  AssetOwnershipType,
  AssetStatus,
  AssetUnit,
  GaneshExpense,
  GaneshExpenseType,
  PandalAsset,
} from "@/shared/types/ganesh";
import { validateNonNegativeAmount, validatePositiveAmount } from "@/shared/utils/ganeshMath";

export const ASSET_CATEGORIES: Array<{ id: AssetCategory; label: string }> = [
  { id: "furniture", label: "Furniture" },
  { id: "sound", label: "Sound" },
  { id: "lighting", label: "Lighting" },
  { id: "electrical", label: "Electrical" },
  { id: "kitchen", label: "Kitchen" },
  { id: "decoration", label: "Decoration" },
  { id: "pooja", label: "Pooja" },
  { id: "storage", label: "Storage" },
  { id: "other", label: "Other" },
];

export const ASSET_UNITS: Array<{ id: AssetUnit; label: string }> = [
  { id: "pieces", label: "Pieces" },
  { id: "sets", label: "Sets" },
  { id: "meters", label: "Meters" },
  { id: "other", label: "Other" },
];

export const ASSET_OWNERSHIP: Array<{ id: AssetOwnershipType; label: string }> = [
  { id: "purchased", label: "Purchased" },
  { id: "donated", label: "Donated" },
  { id: "sponsored", label: "Sponsored" },
  { id: "transferred", label: "Transferred" },
  { id: "other", label: "Other" },
];

export const ASSET_CONDITIONS: Array<{ id: AssetCondition; label: string }> = [
  { id: "new", label: "New" },
  { id: "good", label: "Good" },
  { id: "fair", label: "Fair" },
  { id: "damaged", label: "Damaged" },
  { id: "unusable", label: "Unusable" },
];

export const ASSET_STATUSES: Array<{ id: AssetStatus; label: string }> = [
  { id: "available", label: "Available" },
  { id: "in_use", label: "In use" },
  { id: "damaged", label: "Damaged" },
  { id: "lost", label: "Lost" },
  { id: "disposed", label: "Disposed" },
];

export function assetCategoryLabel(id: AssetCategory | undefined): string {
  return ASSET_CATEGORIES.find((item) => item.id === id)?.label ?? "Other";
}

export function assetConditionLabel(id: AssetCondition | undefined): string {
  return ASSET_CONDITIONS.find((item) => item.id === id)?.label ?? "Good";
}

export function assetStatusLabel(id: AssetStatus | undefined): string {
  return ASSET_STATUSES.find((item) => item.id === id)?.label ?? "Available";
}

export function assetOwnershipLabel(id: AssetOwnershipType | undefined): string {
  return ASSET_OWNERSHIP.find((item) => item.id === id)?.label ?? "Other";
}

export function assetUnitLabel(id: AssetUnit | undefined, quantity = 1): string {
  if (id === "sets") return quantity === 1 ? "set" : "sets";
  if (id === "meters") return quantity === 1 ? "meter" : "meters";
  if (id === "other") return "units";
  return quantity === 1 ? "pc" : "pcs";
}

export function isActiveAsset(asset: Pick<PandalAsset, "status">): boolean {
  return asset.status !== "disposed" && asset.status !== "lost";
}

const PATCH_KEYS = [
  "name",
  "category",
  "unit",
  "ownershipType",
  "estimatedValue",
  "condition",
  "location",
  "description",
  "sourceName",
  "relatedExpenseId",
  "relatedExpenseFestivalId",
  "relatedContributionId",
  "acquisitionCost",
] as const;

export type AssetPatchFields = Partial<Pick<PandalAsset, (typeof PATCH_KEYS)[number]>>;

export function changedAssetFields(
  current: Partial<PandalAsset>,
  patch: AssetPatchFields
): AssetPatchFields {
  const next: AssetPatchFields = {};
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (value !== current[key]) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

export function validateAssetDraft(input: {
  name: string;
  quantity: number;
  estimatedValue: number;
  status?: AssetStatus;
}): { name: string; quantity: number; estimatedValue: number } {
  const name = input.name.trim();
  if (!name) throw new Error("Enter an asset name.");
  if (name.length > 80) throw new Error("Asset name must be 80 characters or less.");
  if (!Number.isInteger(input.quantity)) {
    throw new Error("Quantity must be a whole number.");
  }
  const qtyOk =
    input.quantity === 0
      ? validateNonNegativeAmount(input.quantity, "Quantity")
      : validatePositiveAmount(input.quantity, "Quantity");
  if (!qtyOk.ok) throw new Error(qtyOk.error);
  if (input.quantity === 0 && input.status !== "disposed" && input.status !== "lost") {
    throw new Error("Set status to Disposed or Lost when quantity is 0.");
  }
  const valueOk = validateNonNegativeAmount(input.estimatedValue, "Estimated value");
  if (!valueOk.ok) throw new Error(valueOk.error);
  return { name, quantity: input.quantity, estimatedValue: input.estimatedValue };
}

export function summarizeAssets(
  assets: Array<Pick<PandalAsset, "quantity" | "status" | "estimatedValue">>
) {
  const active = assets.filter((asset) => isActiveAsset(asset));
  return {
    totalItems: assets.reduce((sum, asset) => sum + (asset.quantity || 0), 0),
    totalRecords: assets.length,
    available: assets
      .filter((asset) => asset.status === "available" || asset.status === "in_use")
      .reduce((sum, asset) => sum + (asset.quantity || 0), 0),
    damaged: assets
      .filter((asset) => asset.status === "damaged")
      .reduce((sum, asset) => sum + (asset.quantity || 0), 0),
    disposed: assets
      .filter((asset) => asset.status === "disposed" || asset.status === "lost")
      .reduce((sum, asset) => sum + (asset.quantity || 0), 0),
    estimatedValue: active.reduce((sum, asset) => sum + (asset.estimatedValue || 0), 0),
  };
}

export function expenseTypeOf(
  expense?: Pick<GaneshExpense, "expenseType"> | null
): GaneshExpenseType {
  return expense?.expenseType === "asset_purchase" ? "asset_purchase" : "normal";
}

export function isAssetPurchaseExpense(
  expense?: Pick<GaneshExpense, "expenseType" | "assetId"> | null
): boolean {
  return expenseTypeOf(expense) === "asset_purchase" || Boolean(expense?.assetId);
}

export function expenseCashAmount(
  expense: Pick<GaneshExpense, "godFundAmount" | "personalAmount">
): number {
  return (expense.godFundAmount || 0) + (expense.personalAmount || 0);
}
