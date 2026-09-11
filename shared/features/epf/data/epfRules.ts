/**
 * Statutory EPF contribution slabs — KAN-66.
 *
 * Effective-dated rather than hard-coded: the wage ceiling moved from ₹6,500 to
 * ₹15,000 on 2014-09-01, so a single constant would silently miscompute every
 * month of an employment that began before that. Correcting a historical figure
 * means editing this table and nothing else.
 *
 * Interest rates deliberately live elsewhere (KAN-70, keyed by financial year).
 * Interest is *declared* per financial year while contribution slabs change on
 * arbitrary mid-year dates — one table cannot key both without lying about one
 * of them.
 *
 * Deliberately NOT modelled, because both are establishment-conditional rather
 * than date-only, and encoding them here would produce wrong numbers for the
 * majority of users:
 *   - the 10% contribution category (certain establishment classes)
 *   - the May–Jul 2020 COVID relief rate
 * Both are reachable through a per-row override instead.
 */

export interface EpfContributionRule {
  /** Stable id, stored on each contribution as `rulesVersion` for auditability. */
  id: string;
  /** YYYY-MM-DD, inclusive. */
  effectiveFrom: string;
  /** YYYY-MM-DD, exclusive. Absent means the slab is still in force. */
  effectiveTo?: string;
  /** Statutory wage ceiling for EPF. */
  wageCeiling: number;
  /**
   * Ceiling applied to the EPS diversion. Identical to `wageCeiling` today, but
   * a separate statutory lever, so it gets its own field.
   */
  epsWageCeiling: number;
  employeeRate: number;
  employerRate: number;
  epsRate: number;
}

/** Newest first. Contiguous: each slab's `effectiveTo` is the next one's `effectiveFrom`. */
export const EPF_CONTRIBUTION_RULES: readonly EpfContributionRule[] = [
  {
    id: "2014-09",
    effectiveFrom: "2014-09-01",
    wageCeiling: 15000,
    epsWageCeiling: 15000,
    employeeRate: 0.12,
    employerRate: 0.12,
    epsRate: 0.0833,
  },
  {
    id: "2001-06",
    effectiveFrom: "2001-06-01",
    effectiveTo: "2014-09-01",
    wageCeiling: 6500,
    epsWageCeiling: 6500,
    employeeRate: 0.12,
    employerRate: 0.12,
    epsRate: 0.0833,
  },
] as const;

/** The oldest slab, used for any month predating the table. */
const OLDEST_RULE = EPF_CONTRIBUTION_RULES[EPF_CONTRIBUTION_RULES.length - 1];

/**
 * The slab in force for a contribution month.
 *
 * Compares the month's first day against each slab. Never throws: a month
 * before the table starts falls back to the oldest slab, which is a better
 * failure than blocking entry of very old history.
 */
export function findEpfContributionRule(monthKey: string): EpfContributionRule {
  const firstDay = `${monthKey}-01`;
  const match = EPF_CONTRIBUTION_RULES.find(
    (rule) =>
      firstDay >= rule.effectiveFrom && (!rule.effectiveTo || firstDay < rule.effectiveTo)
  );
  return match ?? OLDEST_RULE;
}
