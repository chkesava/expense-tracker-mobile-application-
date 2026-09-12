import { describe, expect, it } from "vitest";

import {
  documentCategoryLabel,
  summarizeDocuments,
  vaultDocumentId,
} from "@/shared/utils/ganeshDocuments";
import type { PandalDocument } from "@/shared/types/ganesh";

describe("ganeshDocuments utils", () => {
  it("builds a stable vault id per entity slot", () => {
    expect(vaultDocumentId("expense", "e1")).toBe("expense_e1");
    expect(vaultDocumentId("asset", "a9")).toBe("asset_a9");
  });

  it("summarizes only active documents with a storage path", () => {
    const docs = [
      {
        id: "1",
        status: "active",
        storagePath: "pandals/p/festivals/f/expenses/e/r.jpg",
        category: "expense_receipt",
      },
      {
        id: "2",
        status: "active",
        storagePath: "",
        category: "festival_document",
      },
      {
        id: "3",
        status: "archived",
        storagePath: "pandals/p/assets/a/p.jpg",
        category: "asset_photo",
      },
      {
        id: "4",
        status: "active",
        storagePath: "pandals/p/festivals/f/documents/d/q.jpg",
        category: "festival_document",
      },
    ] as PandalDocument[];

    expect(summarizeDocuments(docs)).toEqual({
      total: 2,
      receipts: 1,
      festival: 1,
    });
    expect(documentCategoryLabel("expense_receipt")).toBe("Expense receipt");
  });
});
