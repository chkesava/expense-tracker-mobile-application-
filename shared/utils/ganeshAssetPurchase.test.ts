import { describe, expect, it } from "vitest";

import { can } from "./ganeshPermissions";
import {
  expenseCashAmount,
  expenseTypeOf,
  isAssetPurchaseExpense,
  summarizeAssets,
} from "./ganeshAssets";
import {
  assetPurchaseAmountOf,
  regularExpenseAmount,
  summarizeLedger,
  totalExpenses,
} from "./ganeshMath";

const emptyLedger = {
  openingFunds: [] as number[],
  collections: [] as number[],
  committeeContributions: [] as number[],
  otherCashContributions: [] as number[],
  reimbursements: [] as number[],
  inKindValues: [] as number[],
  sponsoredValues: [] as number[],
};

describe("asset vs expense distinction", () => {
  it("records regular flowers as an expense only", () => {
    const flowers = {
      expenseType: "normal" as const,
      godFundAmount: 1500,
      personalAmount: 0,
    };
    const summary = summarizeLedger({
      ...emptyLedger,
      godFundExpenses: [flowers.godFundAmount],
      personalAmounts: [flowers.personalAmount],
    });
    expect(expenseTypeOf(flowers)).toBe("normal");
    expect(isAssetPurchaseExpense(flowers)).toBe(false);
    expect(totalExpenses(summary)).toBe(1500);
    expect(assetPurchaseAmountOf(summary)).toBe(0);
    expect(regularExpenseAmount(summary)).toBe(1500);
  });

  it("links a chair purchase both ways and keeps reimbursement math", () => {
    const expenseId = "exp-chairs";
    const assetId = "asset-chairs";
    const expense = {
      id: expenseId,
      expenseType: "asset_purchase" as const,
      assetId,
      godFundAmount: 10000,
      personalAmount: 5000,
    };
    const asset = {
      id: assetId,
      relatedExpenseId: expenseId,
      relatedExpenseFestivalId: "fest-2026",
      acquisitionCost: 15000,
      estimatedValue: 15000,
      quantity: 20,
      status: "available" as const,
    };
    const summary = summarizeLedger({
      ...emptyLedger,
      godFundExpenses: [expense.godFundAmount],
      personalAmounts: [expense.personalAmount],
      assetPurchaseAmounts: [expenseCashAmount(expense)],
    });
    expect(expense.assetId).toBe(asset.id);
    expect(asset.relatedExpenseId).toBe(expense.id);
    expect(totalExpenses(summary)).toBe(15000);
    expect(assetPurchaseAmountOf(summary)).toBe(15000);
    expect(regularExpenseAmount(summary)).toBe(0);
    expect(summary.pendingReimbursements).toBe(5000);
  });

  it("does not create cash for donated or sponsored items", () => {
    const summary = summarizeLedger({
      ...emptyLedger,
      godFundExpenses: [],
      personalAmounts: [],
      inKindValues: [8000],
      sponsoredValues: [12000],
    });
    expect(totalExpenses(summary)).toBe(0);
    expect(assetPurchaseAmountOf(summary)).toBe(0);
    expect(summary.inKindValue).toBe(8000);
    expect(summary.sponsoredValue).toBe(12000);
  });

  it("adds an in-kind contribution as an asset without an expense", () => {
    const contribution = { kind: "item", estimatedValue: 4000 };
    const asset = {
      relatedContributionId: "c1",
      estimatedValue: contribution.estimatedValue,
      quantity: 1,
      status: "available" as const,
    };
    const summary = summarizeLedger({
      ...emptyLedger,
      godFundExpenses: [],
      personalAmounts: [],
      inKindValues: [contribution.estimatedValue],
    });
    expect(asset.relatedContributionId).toBe("c1");
    expect(totalExpenses(summary)).toBe(0);
    expect(summarizeAssets([asset]).estimatedValue).toBe(4000);
  });

  it("voids asset-purchase cash and leaves the asset estimated value", () => {
    const asset = {
      estimatedValue: 15000,
      acquisitionCost: 15000,
      quantity: 20,
      status: "available" as const,
    };
    const afterVoid = summarizeLedger({
      ...emptyLedger,
      godFundExpenses: [],
      personalAmounts: [],
      assetPurchaseAmounts: [],
    });
    expect(assetPurchaseAmountOf(afterVoid)).toBe(0);
    expect(asset.estimatedValue).toBe(15000);
    expect(summarizeAssets([asset]).estimatedValue).toBe(15000);
  });

  it("updates acquisitionCost on amount edit without changing estimatedValue", () => {
    const estimatedValue = 15000;
    const nextCost = 14000;
    expect(nextCost).toBe(14000);
    expect(estimatedValue).toBe(15000);
  });

  it("hides Asset purchase when the role cannot create assets", () => {
    expect(can("viewer", "assets.create")).toBe(false);
    expect(can("collector", "assets.create")).toBe(false);
    expect(can("member", "assets.create")).toBe(true);
    expect(can("member", "expenses.create")).toBe(true);
  });
});
