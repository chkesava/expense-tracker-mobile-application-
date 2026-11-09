/**
 * SPENDLY-734 — `bill-daily`'s read-model source (logic: billDailyCore.ts,
 * `findBillWorkOnReadModel`). The Supabase read model through the service
 * role: it only says which cards have bill work. It is never written here, and
 * nothing is written from it (READ_MODEL_RULES R4.3a): the job reads each
 * named card from Firestore and writes from that.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Account, AccountPayment, AccountType, Expense } from "../../shared/types/expense";
import { isActiveLedgerRow } from "../../shared/utils/ledgerRow";
import { SPEC_BY_COLLECTION } from "../../shared/utils/readModel/mapping";
import { storedBillFromDoc, type BillRunQueue, type ReadModelBillSource, type UserBillSettings } from "./billDailyCore";

const PAGE = 1000;

export type ReadModelRow = { uid: string; doc_id: string; doc: Record<string, unknown> | null };
type Row = ReadModelRow;
type Doc = { id: string; data: Record<string, unknown> };
type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Every row of a query, a PostgREST page (1000) at a time. */
export async function allRows(page: (from: number, to: number) => Page): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`read model: ${error.message}`);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** The Firestore document a read-model row copies: its own id and the source data. */
export function readModelRowToDoc(row: Row): Doc {
  const id = row.doc_id.includes("/") ? row.doc_id.slice(row.doc_id.lastIndexOf("/") + 1) : row.doc_id;
  return { id, data: row.doc ?? {} };
}

export function tableOf(collection: string): string {
  const spec = SPEC_BY_COLLECTION.get(collection);
  if (!spec) throw new Error(`read model: ${collection} is not synced`);
  return spec.table;
}

function columnOf(collection: string, field: string): string {
  const column = SPEC_BY_COLLECTION.get(collection)?.fields.find((f) => f.source === field)?.column;
  if (!column) throw new Error(`read model: ${collection}.${field} has no column`);
  return column;
}

/** The users/{uid} settings the pass needs, from the read model's flattened `user_settings` row. */
export function billSettingsFromDoc(doc: Record<string, unknown> | null | undefined): UserBillSettings {
  const d = doc ?? {};
  const reminders = d.creditCardBillReminders as { enabled?: unknown } | undefined;
  return {
    timezone: typeof d.timezone === "string" ? d.timezone : undefined,
    currency: typeof d.currency === "string" ? d.currency : undefined,
    remindersEnabled: typeof reminders?.enabled === "boolean" ? reminders.enabled : undefined,
  };
}

export function supabaseBillReadModel(client: SupabaseClient): ReadModelBillSource {
  const live = (collection: string) =>
    client.from(tableOf(collection)).select("uid, doc_id, doc").eq("source_deleted", false).order("uid").order("doc_id");
  const ofUser = (uid: string, collection: string, field: string, value: string) =>
    allRows((a, b) => live(collection).eq("uid", uid).eq(columnOf(collection, field), value).range(a, b)).then((rows) => rows.map(readModelRowToDoc));

  return {
    async users() {
      const [accounts, types] = await Promise.all([
        allRows((a, b) => live("accounts").range(a, b)),
        allRows((a, b) => live("accountTypes").range(a, b)),
      ]);
      const byUid = new Map<string, { uid: string; accounts: Account[]; accountTypes: AccountType[] }>();
      const entry = (uid: string) => {
        let e = byUid.get(uid);
        if (!e) byUid.set(uid, (e = { uid, accounts: [], accountTypes: [] }));
        return e;
      };
      for (const row of accounts) {
        const d = readModelRowToDoc(row);
        entry(row.uid).accounts.push({ ...(d.data as unknown as Account), id: d.id });
      }
      for (const row of types) {
        const d = readModelRowToDoc(row);
        entry(row.uid).accountTypes.push({ ...(d.data as unknown as AccountType), id: d.id });
      }
      return [...byUid.values()];
    },
    async settings(uid) {
      const { data, error } = await client.from(tableOf("userSettings")).select("doc").eq("uid", uid).eq("source_deleted", false).limit(1);
      if (error) throw new Error(`read model: ${error.message}`);
      return billSettingsFromDoc(((data ?? [])[0] as { doc?: Record<string, unknown> } | undefined)?.doc);
    },
    async cardInputs(uid, cardId) {
      const [expenses, payments, bills] = await Promise.all([
        ofUser(uid, "expenses", "accountId", cardId),
        ofUser(uid, "accountPayments", "toAccountId", cardId),
        ofUser(uid, "creditCardBills", "accountId", cardId),
      ]);
      return {
        expenses: expenses
          .map((d) => ({ ...(d.data as unknown as Expense), id: d.id }))
          .filter((e) => isActiveLedgerRow(e as { deletedAt?: unknown })),
        payments: payments.map((d) => ({ ...(d.data as unknown as AccountPayment), id: d.id })),
        bills: bills.map((d) => ({ bill: storedBillFromDoc(d.id, d.data), updateTime: null })),
      };
    },
  };
}

/**
 * SPENDLY-737: the bill-run queue (`server_run_queue`, service role only).
 * `done` deletes a request only if no newer save re-queued the user since it
 * was read (`requested_at` unchanged or older).
 */
export function supabaseBillRunQueue(client: SupabaseClient): BillRunQueue {
  return {
    async pending() {
      const { data, error } = await client
        .from("server_run_queue")
        .select("uid, requested_at")
        .eq("job", "bill-daily")
        .order("requested_at", { ascending: true })
        .limit(500);
      if (error) throw new Error(`read model: ${error.message}`);
      return ((data ?? []) as Array<{ uid: string; requested_at: string }>).map((r) => ({ uid: r.uid, requestedAt: r.requested_at }));
    },
    async done(uid, requestedAt) {
      const { error } = await client
        .from("server_run_queue")
        .delete()
        .eq("job", "bill-daily")
        .eq("uid", uid)
        .lte("requested_at", requestedAt);
      if (error) throw new Error(`read model: ${error.message}`);
    },
  };
}
