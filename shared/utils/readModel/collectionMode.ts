import { READ_MODEL_TABLES } from "./mapping";

/**
 * SPENDLY-673 — the per-collection read switch:
 * `system_settings/global.readModel.<collection>` (server-only writable).
 *
 * - `firestore` (default, and for anything missing or unknown): today's listener.
 * - `shadow`: Firestore serves; the on-device copy is compared, counts logged.
 * - `supabase`: the on-device copy serves; the Firestore listener isn't mounted.
 *
 * Whatever is configured, it is `firestore` in duress, Spendly Test, signed out,
 * a build without the read model, without the copy (`readModel.localCopy`), and
 * for the rest of the session after a failure. `supabase` also waits for the
 * copy to be ready (hydrated), so a screen never goes blank while it fills.
 */
export const COLLECTION_MODES = ["firestore", "shadow", "supabase"] as const;
export type CollectionMode = (typeof COLLECTION_MODES)[number];

/**
 * Every synced collection has a switch, except the users/{uid} copy
 * (`userSettings`): it holds only the allowlisted fields (no PIN or lock
 * settings), so the settings provider always reads Firestore.
 */
export const READ_MODEL_COLLECTIONS: readonly string[] = READ_MODEL_TABLES.filter((t) => !t.root).map((t) => t.collection);

/**
 * SPENDLY-690: the collections the app actually reads through
 * `readModel.<collection>` (596–599, 673, 674). The bulk switch workflow
 * sets exactly these; `lib/readModelLocal/providerSwitch.test.ts` keeps the
 * list equal to the wired providers.
 */
export const SWITCHED_COLLECTIONS: readonly string[] = [
  "categories", "spaces", "categorizationRules", "calendarReminders",
  "expenses", "incomes",
  "accounts", "accountTypes", "accountPayments", "accountEntries", "accountTransfers", "creditCardBills",
  "categoryBudgets", "financialSummaries", "netWorthHistory", "financialGoals",
  "investments", "holdings", "investmentCashTransactions", "portfolioSettings", "portfolioTransactions",
  "sipPlans", "sipTransactions", "virtualPositions", "subscriptions", "watchlists", "watchlists/items",
  "epfContributions", "epfEstablishments", "epfInterestEntries",
  "borrowings", "borrowingRepayments", "receivables", "receivableRepayments",
  // SPENDLY-230: the unified inbox's notification rows.
  "notifications",
];

export function configuredCollectionMode(readModelSetting: unknown, collection: string): CollectionMode {
  if (!readModelSetting || typeof readModelSetting !== "object") return "firestore";
  const value = (readModelSetting as Record<string, unknown>)[collection];
  return (COLLECTION_MODES as readonly unknown[]).includes(value) ? (value as CollectionMode) : "firestore";
}

export type CollectionModeInput = {
  setting: unknown;
  collection: string;
  envConfigured: boolean;
  localTestMode: boolean;
  duress: boolean;
  signedIn: boolean;
  localCopyOn: boolean;
  copyState: "off" | "hydrating" | "ready" | "error";
  /** This collection failed on the copy earlier in the session. */
  fellBack: boolean;
};

export type CollectionModeDecision = { mode: CollectionMode; configured: CollectionMode; reason?: string };

export function effectiveCollectionMode(input: CollectionModeInput): CollectionModeDecision {
  const configured = READ_MODEL_COLLECTIONS.includes(input.collection) ? configuredCollectionMode(input.setting, input.collection) : "firestore";
  const fs = (reason: string): CollectionModeDecision => ({ mode: "firestore", configured, reason });
  if (configured === "firestore") return { mode: "firestore", configured };
  if (input.duress) return fs("duress");
  if (input.localTestMode) return fs("local test mode");
  if (!input.signedIn) return fs("signed out");
  if (!input.envConfigured) return fs("read model not configured");
  if (!input.localCopyOn) return fs("readModel.localCopy is off");
  if (input.fellBack) return fs("fell back this session");
  if (configured === "supabase" && input.copyState !== "ready") return fs(`copy ${input.copyState}`);
  return { mode: configured, configured };
}
