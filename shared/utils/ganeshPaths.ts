export function pandalDoc(pandalId: string): [string, string] {
  return ["pandals", pandalId];
}

export function pandalMembersCol(pandalId: string): [string, string, string] {
  return ["pandals", pandalId, "members"];
}

export function festivalsCol(pandalId: string): [string, string, string] {
  return ["pandals", pandalId, "festivals"];
}

/** One doc per calendar year so two festivals cannot claim 2026 at once. */
export function festivalYearDoc(pandalId: string, year: number): string[] {
  return ["pandals", pandalId, "festivalYears", String(year)];
}

export function festivalDoc(pandalId: string, festivalId: string): string[] {
  return ["pandals", pandalId, "festivals", festivalId];
}

export function festivalCol(
  pandalId: string,
  festivalId: string,
  name:
    | "members"
    | "openingFunds"
    | "households"
    | "collections"
    | "contributions"
    | "expenses"
    | "reimbursements"
    | "categories"
    | "activity"
    | "auditLogs"
    | "fundTransfers"
    | "sponsorships"
    | "seva"
    // GS-076 / GS-075
    | "collectionSessions"
    | "reconciliations"
    | "cashAdjustments"
    // KAN-125. These carry no money of their own: a registration writes an
    // ordinary `collections` row and points at it, so they must stay out of
    // `LEDGER_SUBCOLLECTIONS` or the same rupees get counted twice.
    | "tokenLadduConfig"
    | "tokenLadduRegistrations"
    | "tokenLadduTokens"
    | "tokenDrawSessions"
    | "tokenDrawResults"
    // KAN-126. The daily prasadam register: one document per offering, filed
    // under a festival day and a morning/evening session. It holds no amount
    // field at all — `firestore.rules` enforces that — so it must stay out of
    // `LEDGER_SUBCOLLECTIONS`. Not to be confused with `SevaKind = "prasadam"`,
    // which is a slot on the programme rather than a register of providers.
    | "prasadamEntries"
): string[] {
  return ["pandals", pandalId, "festivals", festivalId, name];
}

/**
 * The Token Laddu config singleton (KAN-125). One per festival, so its id is a
 * constant — the same shape as `permanentFund/current` and `summary/totals`.
 *
 * It also holds the `nextTokenNumber` allocator. That is deliberate: the
 * summary document's rule is already against Firestore's 1000-expression
 * evaluation ceiling, and putting a fourth allocator there would spend budget
 * on the rule that can least afford it.
 */
export function tokenLadduConfigDoc(pandalId: string, festivalId: string): string[] {
  return [...festivalCol(pandalId, festivalId, "tokenLadduConfig"), "current"];
}

/**
 * A draw result's id encodes its sequence, so two admins racing the same draw
 * cannot both commit — the second write is a create against a document that
 * already exists.
 */
export function tokenDrawResultId(drawSessionId: string, sequence: number): string {
  return `${drawSessionId}__${sequence}`;
}

/**
 * Volunteer duties hang off a seva, two levels below the festival. They are
 * their own collection rather than an array on the seva doc so two coordinators
 * can staff the same aarti at once without clobbering each other's writes.
 */
export function sevaDutiesCol(
  pandalId: string,
  festivalId: string,
  sevaId: string
): string[] {
  return ["pandals", pandalId, "festivals", festivalId, "seva", sevaId, "duties"];
}

export function permanentFundDoc(pandalId: string): string[] {
  return ["pandals", pandalId, "permanentFund", "current"];
}

export function permanentFundTransactionsCol(pandalId: string): string[] {
  return ["pandals", pandalId, "permanentFundTransactions"];
}

/**
 * Canonical festival summary. Cloud Functions write derived totals here;
 * the app reads the same document. Do not introduce a second summary id.
 */
export function summaryDoc(pandalId: string, festivalId: string): string[] {
  return ["pandals", pandalId, "festivals", festivalId, "summary", "totals"];
}

/**
 * Pre-KAN-36 client path. Repair copies allocators from here onto
 * `summary/totals`. Do not listen, increment, or write derived fields here.
 */
export function legacySummaryDoc(pandalId: string, festivalId: string): string[] {
  return ["pandals", pandalId, "festivals", festivalId, "summary", "current"];
}

export function membershipDoc(uid: string, pandalId: string): string[] {
  return ["users", uid, "pandalMemberships", pandalId];
}

export function membershipsCol(uid: string): string[] {
  return ["users", uid, "pandalMemberships"];
}

export function pandalMemberAuditsCol(pandalId: string): string[] {
  return ["pandals", pandalId, "memberAudits"];
}

export function pandalRolesCol(pandalId: string): string[] {
  return ["pandals", pandalId, "roles"];
}

export function pandalAssetsCol(pandalId: string): string[] {
  return ["pandals", pandalId, "assets"];
}

export function pandalAssetAuditsCol(pandalId: string): string[] {
  return ["pandals", pandalId, "assetAudits"];
}

export function pandalSponsorsCol(pandalId: string): string[] {
  return ["pandals", pandalId, "sponsors"];
}

export function pandalSponsorAuditsCol(pandalId: string): string[] {
  return ["pandals", pandalId, "sponsorAudits"];
}
