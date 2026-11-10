/**
 * SPENDLY-727 — the daily server credit-card bill pass that replaces the
 * legacy site's `credit-card-bills` cron (SPENDLY-682). Pure; Firestore and
 * the read model come in as ports.
 *
 * The legacy cron summed raw expenses (no cashback), rewrote open bills'
 * amounts every morning, made random-id duplicates (SPENDLY-676) and read
 * every user's full expense history daily. This job instead:
 *
 * - **Only cards whose cycle closed today or yesterday** in the user's zone
 *   (the legacy cron's two mornings per close), found from one collection-group
 *   read of accounts. Everyone else costs nothing.
 * - Runs **the app's own bill pass** on that card (the same pure functions, in
 *   the same order as `CreditCardBillsProvider`): drafts → refresh patches →
 *   allocation (payments and cashback, SPENDLY-719) → duplicate resolution.
 *   It reaches in one run the end state the app reaches (new statements get
 *   their allocation at once, so a cashback-settled statement is born PAID).
 * - Writes only the difference from what is stored, in one atomic batch per
 *   card: new statements are *created* at the app's deterministic id
 *   `${accountId}_${statementDate}` (refused if the app made it first), and
 *   changed bills are *updated only if unchanged since read* (SPENDLY-497).
 *   A refusal writes nothing; the app's pass, or tomorrow's run, decides again.
 * - Adds the "statement created" inbox notice (deterministic id) for a
 *   statement that closed today or yesterday, as the legacy cron did.
 * - Duress trees are skipped; erased accounts have no cards to find.
 * - SPENDLY-734 (epic SPENDLY-735: the app computes no bill pass): also every
 *   card whose work the **read model** shows (`findBillWorkOnReadModel`): a
 *   payment or cashback recorded after the close, a stale stored settlement.
 *   Finding it costs no Firestore reads; the card is then read and written
 *   from Firestore exactly like a closing card (R4.3a: never from the copy).
 */

import type { CreditCardBill } from "../../shared/types/creditCardBill";
import { AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY } from "../../shared/types/creditCardBill";
import type { Account, AccountPayment, AccountType, Expense } from "../../shared/types/expense";
import { getAccountKind } from "../../shared/utils/accountKind";
import {
  autoCreditCardBillDocId,
  collectAutoCreditCardBillDrafts,
  collectAutoCreditCardBillRefreshPatches,
} from "../../shared/utils/autoCreditCardBills";
import { getClosedBillingCycle, normalizeBillGenerationDay } from "../../shared/utils/billingCycle";
import { refreshCreditCardBillDerivedFields } from "../../shared/utils/creditCardBillDerived";
import { collectCreditBillAllocationPatches, collectCreditBillDuplicateResolutions } from "../../shared/utils/creditCardLedger";
import { formatDateKey, isValidTimeZone, parseLocalDate, shiftDateKey, toLocalDateKey } from "../../shared/utils/dates";
import { isDuressUid } from "../../shared/utils/duress";
import {
  applyJobWrites,
  bump,
  newJobSummary,
  recordApply,
  type DailyJobSummary,
  type JobDb,
  type JobPush,
  type JobWrite,
} from "./dailyJobCore";
import type { ReadBudget } from "./pushRunCore";

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export type StoredBill = { bill: CreditCardBill; updateTime: unknown };

const NUMERIC_BILL_FIELDS = ["statementAmount", "minimumDueAmount", "amountPaid", "remainingAmount"] as const;

/**
 * A bill as stored (numbers normalised), from Firestore or its read-model
 * copy. Not `parseStoredBill`: its recomputed status would hide a stale
 * stored one.
 */
export function storedBillFromDoc(id: string, data: Record<string, unknown>): CreditCardBill {
  const bill = { ...data, id } as Record<string, unknown>;
  for (const f of NUMERIC_BILL_FIELDS) if (bill[f] != null) bill[f] = Number(bill[f]) || 0;
  if (!Array.isArray(bill.paymentIds)) bill.paymentIds = [];
  return bill as unknown as CreditCardBill;
}
export type UserBillSettings = { timezone?: string; currency?: string; remindersEnabled?: boolean };

export type BillDailyPorts = {
  /** Every account across users, with its owner. One collection-group read. */
  listAccounts(): Promise<Array<{ uid: string; account: Account }>>;
  /** SPENDLY-737 (queue mode): only these users' accounts, one collection read each. */
  listAccountsFor?(uids: readonly string[]): Promise<Array<{ uid: string; account: Account }>>;
  accountTypes(uid: string): Promise<AccountType[]>;
  settings(uid: string): Promise<UserBillSettings>;
  /** One card's inputs: its expenses, the payments into it, and its bills. */
  cardInputs(uid: string, cardId: string): Promise<{ expenses: Expense[]; payments: AccountPayment[]; bills: StoredBill[] }>;
  db: JobDb;
  stamp: () => unknown;
};

/** True when the card's latest closed cycle ended today or yesterday (both YYYY-MM-DD, user's zone). */
export function cardClosedRecently(account: Pick<Account, "billGenerationDay">, today: string): string | null {
  const billDay = normalizeBillGenerationDay(account.billGenerationDay);
  if (billDay == null) return null;
  const closed = toLocalDateKey(getClosedBillingCycle(billDay, parseLocalDate(today)).cycleEnd);
  return closed === today || closed === shiftDateKey(today, -1) ? closed : null;
}

const billPath = (uid: string, id: string) => `users/${uid}/creditCardBills/${id}`;
const noticeId = (billId: string) => `n_ccstmt_${billId}`;

type Target = CreditCardBill & { isNew: boolean };

/**
 * The app's bill pass for one card, from stored state to the state it
 * converges to. Returns the bills that differ from storage.
 */
export function planCardBills(input: {
  card: Account;
  typeNameById: Map<string, string>;
  expenses: Expense[];
  payments: AccountPayment[];
  stored: StoredBill[];
  today: string;
  timezone: string;
  currency: string;
  remindersEnabled: boolean;
}): { targets: Target[]; drafts: number; patches: number; allocations: number; duplicates: number } {
  const { card, typeNameById, expenses, payments, today } = input;
  const derive = (b: CreditCardBill) => refreshCreditCardBillDerivedFields(b, input.timezone, input.remindersEnabled);
  const bills = new Map<string, Target>(input.stored.map(({ bill }) => [bill.id, { ...bill, isNew: false }]));
  const base = { accounts: [card], typeNameById, expenses, today };

  // 1. Drafts: missing closed statements, at the app's deterministic id.
  const drafts = collectAutoCreditCardBillDrafts({ ...base, existingBills: [...bills.values()] });
  for (const d of drafts) {
    const id = autoCreditCardBillDocId(d.accountId, d.statementDate);
    if (bills.has(id)) continue;
    const draft = {
      id,
      accountId: d.accountId,
      statementAmount: d.statementAmount,
      minimumDueAmount: d.minimumDueAmount,
      statementDate: d.statementDate,
      dueDate: d.dueDate,
      billingPeriodStart: d.billingPeriodStart ?? undefined,
      billingPeriodEnd: d.billingPeriodEnd ?? undefined,
      note: d.note ?? undefined,
      currency: d.currency || input.currency,
      reminderEnabled: d.reminderEnabled ?? true,
      reminderFrequency: d.reminderFrequency ?? AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
      amountPaid: 0,
      paymentIds: [],
      status: "UPCOMING",
      remainingAmount: d.statementAmount,
      isNew: true,
    } as unknown as Target;
    bills.set(id, { ...draft, ...derive(draft) });
  }

  // 2. Refresh patches (cycle window changed, spend backdated): auto bills only.
  const patches = collectAutoCreditCardBillRefreshPatches({ ...base, existingBills: [...bills.values()] });
  for (const p of patches) {
    const cur = bills.get(p.billId);
    if (!cur) continue;
    const next = { ...cur, ...p };
    delete (next as { billId?: string }).billId;
    bills.set(p.billId, { ...next, ...derive(next) });
  }

  // 3. Allocation: payments and cashback settle statements, as the ledger does.
  const allocations = collectCreditBillAllocationPatches({
    accounts: [card],
    isCreditAccount: (a) => getAccountKind(typeNameById.get(a.typeId) || "") === "credit",
    expenses,
    payments,
    bills: [...bills.values()],
    today,
  });
  for (const a of allocations) {
    const cur = bills.get(a.billId);
    if (!cur) continue;
    const next = { ...cur, amountPaid: a.amountPaid, paymentIds: a.paymentIds, ...(a.paymentDate ? { paymentDate: a.paymentDate } : {}) };
    bills.set(a.billId, { ...next, ...derive(next) });
  }

  // 4. Duplicates: one canonical bill per cycle; the rest CANCELLED, never deleted.
  const duplicates = collectCreditBillDuplicateResolutions([...bills.values()], today);
  for (const r of duplicates) {
    const canon = bills.get(r.canonicalId);
    if (canon && r.canonicalPatch) bills.set(r.canonicalId, { ...canon, ...r.canonicalPatch });
    for (const id of r.cancelIds) {
      const cur = bills.get(id);
      if (cur) bills.set(id, { ...cur, status: "CANCELLED" });
    }
  }

  const storedById = new Map(input.stored.map(({ bill }) => [bill.id, bill]));
  const targets = [...bills.values()].filter((b) => b.isNew || changedFields(storedById.get(b.id)!, b).length > 0);
  return { targets, drafts: drafts.length, patches: patches.length, allocations: allocations.length, duplicates: duplicates.length };
}

/** Bill fields the pass may change. */
const PASS_FIELDS = [
  "statementAmount",
  "minimumDueAmount",
  "statementDate",
  "dueDate",
  "billingPeriodStart",
  "billingPeriodEnd",
  "amountPaid",
  "paymentIds",
  "paymentDate",
  "status",
  "remainingAmount",
  "nextReminderAt",
] as const;

function changedFields(stored: CreditCardBill, next: CreditCardBill): (typeof PASS_FIELDS)[number][] {
  return PASS_FIELDS.filter((f) => JSON.stringify(stored[f] ?? null) !== JSON.stringify(next[f] ?? null));
}

/** The batch for one card: creates for new statements, compare-and-set updates for changed ones. */
export function cardBillWrites(
  uid: string,
  targets: Target[],
  stored: StoredBill[],
  notifyClosed: (bill: CreditCardBill) => boolean
): JobWrite[] {
  const byId = new Map(stored.map((s) => [s.bill.id, s]));
  const writes: JobWrite[] = [];
  for (const t of targets) {
    const { isNew, id, ...doc } = t;
    if (isNew) {
      const data: Record<string, unknown> = { id };
      for (const [k, v] of Object.entries(doc)) if (v !== undefined) data[k] = v;
      writes.push({ kind: "create", path: billPath(uid, id), data });
      if (notifyClosed(t)) {
        const nid = noticeId(id);
        writes.push({
          kind: "set",
          path: `users/${uid}/notifications/${nid}`,
          stampCreatedAt: true,
          data: {
            id: nid,
            type: "credit_card_statement",
            title: "Credit card statement created",
            body: "A billing cycle closed. Open Cards to review the statement.",
            read: false,
            meta: { billId: id, accountId: t.accountId },
          },
        });
      }
      continue;
    }
    const s = byId.get(id)!;
    const data: Record<string, unknown> = {};
    for (const f of changedFields(s.bill, t)) data[f] = t[f] ?? null;
    writes.push({ kind: "update", path: billPath(uid, id), data, lastUpdateTime: s.updateTime });
  }
  return writes;
}

/**
 * SPENDLY-734 — the read model's copy of the users' card data, for finding
 * bill work without Firestore reads. Only ever read; nothing is written from it.
 */
export type ReadModelBillSource = {
  /** Every user with accounts in the read model, with their accounts and account types. */
  users(): Promise<Array<{ uid: string; accounts: Account[]; accountTypes: AccountType[] }>>;
  settings(uid: string): Promise<UserBillSettings>;
  cardInputs(uid: string, cardId: string): Promise<{ expenses: Expense[]; payments: AccountPayment[]; bills: StoredBill[] }>;
};

export type ReadModelBillWork = {
  /** uid → card ids whose bills the app's pass would change, per the copy. */
  cards: Map<string, Set<string>>;
  usersSeen: number;
  failures: number;
};

/**
 * Runs the app's bill pass (`planCardBills`) on the read model's copy of every
 * credit card and returns the cards it would change. A card can be named
 * wrongly when the copy lags; the job then reads it from Firestore, finds
 * nothing and counts `readModelDisagreed`. Never logs a uid.
 */
export async function findBillWorkOnReadModel(
  source: ReadModelBillSource,
  now: Date,
  options: { onlyUids?: ReadonlySet<string> } = {}
): Promise<ReadModelBillWork> {
  const work: ReadModelBillWork = { cards: new Map(), usersSeen: 0, failures: 0 };
  for (const { uid, accounts, accountTypes } of await source.users()) {
    if (!uid || isDuressUid(uid)) continue;
    if (options.onlyUids && !options.onlyUids.has(uid)) continue;
    const typeNameById = new Map(accountTypes.map((t) => [t.id, t.name]));
    const cards = accounts.filter((a) => a.id && getAccountKind(typeNameById.get(a.typeId) || "") === "credit");
    if (!cards.length) continue;
    work.usersSeen += 1;
    try {
      const settings = await source.settings(uid);
      const timezone = settings.timezone || DEFAULT_TIME_ZONE;
      if (!isValidTimeZone(timezone)) continue;
      const today = formatDateKey(now, timezone);
      for (const card of cards) {
        const { expenses, payments, bills } = await source.cardInputs(uid, card.id as string);
        const plan = planCardBills({
          card,
          typeNameById,
          expenses,
          payments,
          stored: bills,
          today,
          timezone,
          currency: settings.currency || "INR",
          remindersEnabled: settings.remindersEnabled ?? true,
        });
        if (plan.targets.length) work.cards.set(uid, (work.cards.get(uid) ?? new Set()).add(card.id as string));
      }
    } catch {
      work.failures += 1;
    }
  }
  return work;
}

export async function runBillDaily(opts: {
  ports: BillDailyPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  /** SPENDLY-734: cards with work found on the read model; they join the closing cards. */
  readModel?: ReadModelBillWork | null;
  /** SPENDLY-737 (queue mode): only these users; their accounts come from `listAccountsFor`. */
  onlyUids?: readonly string[];
  /** Accumulate into this summary (queue mode runs several rounds). */
  summary?: DailyJobSummary;
}): Promise<DailyJobSummary> {
  const { ports, now, budget } = opts;
  const summary = opts.summary ?? newJobSummary("bill-daily", opts.dryRun);
  if (opts.readModel) {
    bump(summary, "readModelUsers", opts.readModel.usersSeen);
    bump(summary, "readModelCards", [...opts.readModel.cards.values()].reduce((n, c) => n + c.size, 0));
    if (opts.readModel.failures) bump(summary, "readModelFailures", opts.readModel.failures);
  }
  let all: Array<{ uid: string; account: Account }>;
  if (opts.onlyUids) {
    if (!ports.listAccountsFor) throw new Error("bill-daily: queue mode needs listAccountsFor");
    all = opts.onlyUids.length ? await ports.listAccountsFor(opts.onlyUids) : [];
  } else {
    all = await ports.listAccounts();
  }
  const byUser = new Map<string, Account[]>();
  for (const { uid, account } of all) byUser.set(uid, [...(byUser.get(uid) ?? []), account]);

  for (const [uid, accounts] of byUser) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    // Cheap first filter on the bill day alone (any zone is within a day of UTC).
    const utcToday = formatDateKey(now, "UTC");
    const hinted = opts.readModel?.cards.get(uid) ?? new Set<string>();
    const maybe = accounts.filter(
      (a) =>
        (!!a.id && hinted.has(a.id)) ||
        (normalizeBillGenerationDay(a.billGenerationDay) != null &&
          [shiftDateKey(utcToday, -1), utcToday, shiftDateKey(utcToday, 1)].some((d) => cardClosedRecently(a, d)))
    );
    if (!maybe.length) continue;

    const types = await ports.accountTypes(uid);
    const typeNameById = new Map(types.map((t) => [t.id, t.name]));
    const cards = maybe.filter((a) => getAccountKind(typeNameById.get(a.typeId) || "") === "credit");
    if (!cards.length) continue;
    const settings = await ports.settings(uid);
    // Unset → the legacy default. Set but invalid → skip this user: guessing a
    // zone could pick the wrong close day, and a throw would stop everyone else.
    const timezone = settings.timezone ? settings.timezone : DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(timezone)) {
      bump(summary, "invalidTimeZone");
      summary.failures.push(`card ${cards[0].id}: invalid timezone on the account; its statements were skipped`);
      continue;
    }
    const today = formatDateKey(now, timezone);

    for (const card of cards) {
      if (budget.exhausted()) break;
      const closed = cardClosedRecently(card, today);
      const fromReadModel = !!card.id && hinted.has(card.id);
      if ((!closed && !fromReadModel) || !card.id) continue;
      bump(summary, closed ? "cardsClosing" : "cardsFromReadModel");
      const { expenses, payments, bills } = await ports.cardInputs(uid, card.id);
      const plan = planCardBills({
        card,
        typeNameById,
        expenses,
        payments,
        stored: bills,
        today,
        timezone,
        currency: settings.currency || "INR",
        remindersEnabled: settings.remindersEnabled ?? true,
      });
      if (!plan.targets.length) {
        bump(summary, "cardsUpToDate");
        // The copy named this card, Firestore has nothing to change: the copy lags.
        if (!closed) bump(summary, "readModelDisagreed");
        continue;
      }
      const yesterday = shiftDateKey(today, -1);
      const writes = cardBillWrites(uid, plan.targets, bills, (b) => b.statementDate === today || b.statementDate === yesterday);
      const result = await applyJobWrites({ db: ports.db, uid, writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
      recordApply(summary, result, `card ${card.id}`);
      if (result.status === "written" || result.status === "dry-run") {
        bump(summary, "billsCreated", plan.targets.filter((t) => t.isNew).length);
        bump(summary, "billsUpdated", plan.targets.filter((t) => !t.isNew).length);
      }
      if (result.status === "conflict") bump(summary, "conflicts");
    }
  }
  return summary;
}

/**
 * SPENDLY-737 — the users the read model queued after an app save to a bill
 * input (supabase-readmodel migration 20261112000000: the trigger queues the
 * owner and asks GitHub to run this job with `trigger: queue`). Never logged.
 */
export type BillRunQueue = {
  pending(): Promise<Array<{ uid: string; requestedAt: string }>>;
  /** Clears the user's request unless a newer save re-queued it meanwhile. */
  done(uid: string, requestedAt: string): Promise<void>;
};

export const BILL_QUEUE_MAX_ROUNDS = 3;

/**
 * Queue mode: settles the queued users only. Each round reads the queue, finds
 * the work for those users on the read model, runs the bill pass for their
 * cards (closing or named) from Firestore, then clears the requests it
 * served. A save during the run re-queues its user (newer `requestedAt`), so
 * the next round, or the next dispatch, takes it. A dry run reads only.
 */
export async function runBillQueue(opts: {
  queue: BillRunQueue;
  ports: BillDailyPorts;
  readModel: ReadModelBillSource;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  maxRounds?: number;
}): Promise<DailyJobSummary> {
  const summary = newJobSummary("bill-daily", opts.dryRun);
  const rounds = opts.dryRun ? 1 : opts.maxRounds ?? BILL_QUEUE_MAX_ROUNDS;
  for (let round = 0; round < rounds; round += 1) {
    if (opts.budget.exhausted()) break;
    const pending = await opts.queue.pending();
    if (!pending.length) break;
    bump(summary, "queueRounds");
    const live = pending.filter((p) => p.uid && !isDuressUid(p.uid));
    bump(summary, "queueUsers", live.length);
    const onlyUids = live.map((p) => p.uid);
    const work = await findBillWorkOnReadModel(opts.readModel, opts.now, { onlyUids: new Set(onlyUids) });
    await runBillDaily({
      ports: opts.ports,
      now: opts.now,
      dryRun: opts.dryRun,
      budget: opts.budget,
      push: opts.push,
      log: opts.log,
      readModel: work,
      onlyUids,
      summary,
    });
    if (opts.dryRun) break;
    // Out of budget mid-round: keep every request; the next run serves them (idempotent).
    if (opts.budget.exhausted()) break;
    for (const p of pending) await opts.queue.done(p.uid, p.requestedAt);
  }
  return summary;
}
