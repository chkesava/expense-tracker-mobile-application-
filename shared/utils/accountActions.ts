/**
 * The Account Detail action model (SPENDLY-91).
 *
 * The screen accumulated its actions one ticket at a time: a Reconcile button
 * beside the credit statement, a Download button below the statistics, a
 * Documents card, a Notes card. Each was reasonable where it landed, and
 * together they were a scavenger hunt.
 *
 * This module is the single ordered answer to "what can I do with this
 * account". It is pure and carries no handlers, so the *availability* rules —
 * which action exists for a credit card, what export policy switches off — are
 * testable without mounting a screen. The screen maps ids to behaviour.
 */

export type AccountActionId =
  | "downloadStatement"
  | "exportCsv"
  | "reconcile"
  | "balanceHistory"
  | "documents"
  | "notes"
  | "settings";

/** Which section a navigating action lands on. */
export type AccountSectionId = "overview" | "transactions" | "insights";

export interface AccountActionDescriptor {
  id: AccountActionId;
  label: string;
  /** Present when the action cannot be taken, and says why. */
  disabledReason?: string;
  /**
   * Where the action goes. `section` scrolls the screen to a tab that already
   * holds the feature; `modal` opens a sheet. Encoded rather than inferred so
   * the sheet can present them identically while the screen routes them
   * differently.
   */
  target: { kind: "modal" } | { kind: "section"; section: AccountSectionId };
}

export interface AccountActionContext {
  isCreditCard: boolean;
  /** False when system policy has data export switched off. */
  exportAllowed: boolean;
}

const EXPORT_DISABLED = "Data export is switched off by system policy.";

/**
 * Every action for this account, in the order the sheet shows them.
 *
 * Ordered by how often the action is wanted, not by how the features were
 * built: statements first because that is what people open an account to get,
 * settings last because it is the one thing already reachable from the header.
 *
 * Nothing is hidden for being unavailable. An action that cannot be taken is
 * listed with the reason, because a missing row reads as a missing feature —
 * a user whose admin has switched off export should be told that, not left
 * hunting for a button that was there last week.
 */
export function buildAccountActions(
  context: AccountActionContext
): AccountActionDescriptor[] {
  const exportDisabled = context.exportAllowed ? undefined : EXPORT_DISABLED;

  return [
    {
      id: "downloadStatement",
      label: "Download statement",
      disabledReason: exportDisabled,
      target: { kind: "modal" },
    },
    {
      id: "exportCsv",
      label: "Export CSV",
      disabledReason: exportDisabled,
      target: { kind: "modal" },
    },
    {
      // A card and a bank account are reconciled against different documents:
      // a card against its statement, an account against its passbook. Same
      // slot, different action -- which is why this is one entry and not two.
      id: "reconcile",
      label: context.isCreditCard ? "Reconcile statement" : "Reconcile account",
      target: { kind: "modal" },
    },
    {
      // Not disabled for a credit card even though there is no balance to
      // chart. The card itself explains why a liability has no running
      // balance, and that explanation is worth more than a greyed-out row.
      id: "balanceHistory",
      label: "Balance history",
      target: { kind: "section", section: "insights" },
    },
    {
      id: "documents",
      label: "Documents",
      target: { kind: "section", section: "overview" },
    },
    {
      id: "notes",
      label: "Notes",
      target: { kind: "section", section: "overview" },
    },
    {
      id: "settings",
      label: "Account settings",
      target: { kind: "modal" },
    },
  ];
}

export function isAccountActionEnabled(action: AccountActionDescriptor): boolean {
  return action.disabledReason === undefined;
}

/** The section an action lands on, or null when it opens a sheet instead. */
export function sectionForAccountAction(
  action: AccountActionDescriptor
): AccountSectionId | null {
  return action.target.kind === "section" ? action.target.section : null;
}

export const ACCOUNT_SECTIONS: { id: AccountSectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "insights", label: "Insights" },
];

export const DEFAULT_ACCOUNT_SECTION: AccountSectionId = "overview";

/**
 * Only the Transactions section renders the activity list.
 *
 * The list is the one unbounded thing on this screen -- an account with years
 * of history has thousands of rows -- so the other two sections hand the list
 * an empty array rather than paying to virtualize rows nobody is looking at.
 */
export function sectionShowsActivityList(section: AccountSectionId): boolean {
  return section === "transactions";
}
