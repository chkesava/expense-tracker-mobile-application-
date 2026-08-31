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
): string[] {
  return ["pandals", pandalId, "festivals", festivalId, name];
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

export function summaryDoc(pandalId: string, festivalId: string): string[] {
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
