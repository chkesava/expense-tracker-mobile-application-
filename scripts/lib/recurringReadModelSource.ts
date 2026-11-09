/**
 * SPENDLY-744 — `recurring-weekly`'s read-model source (logic:
 * recurringWeeklyCore.ts). The Supabase copy of each user's expenses,
 * subscriptions and recurring dismissals, service role, read only. The job's
 * own output (recurringSuggestions) is read from Firestore, not from here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Expense } from "../../shared/types/expense";
import { allRows, readModelRowToDoc, tableOf } from "./billReadModelSource";
import type { RecurringInputs } from "./recurringWeeklyCore";

export function supabaseRecurringReadModel(client: SupabaseClient) {
  const docsOf = async (collection: string, uid: string) =>
    (
      await allRows((a, b) =>
        client.from(tableOf(collection)).select("uid, doc_id, doc").eq("uid", uid).eq("source_deleted", false).order("doc_id").range(a, b)
      )
    ).map(readModelRowToDoc);

  return {
    async listOwners(): Promise<string[]> {
      const rows = await allRows((a, b) =>
        client.from(tableOf("userSettings")).select("uid, doc_id").eq("source_deleted", false).order("uid").range(a, b)
      );
      return [...new Set(rows.map((r) => r.uid))];
    },
    async inputs(uid: string): Promise<RecurringInputs> {
      const [expenses, subscriptions, dismissals] = await Promise.all([
        docsOf("expenses", uid),
        docsOf("subscriptions", uid),
        docsOf("recurringDismissals", uid),
      ]);
      return {
        expenses: expenses.map((d) => ({ ...(d.data as unknown as Expense), id: d.id })),
        subscriptions: subscriptions.map((d) => ({ name: String((d.data as { name?: unknown }).name ?? "") })),
        // The dismissal's document id is the folded merchant key (recurringDismissals.ts).
        dismissedMerchants: dismissals.map((d) => d.id).filter(Boolean),
      };
    },
  };
}
