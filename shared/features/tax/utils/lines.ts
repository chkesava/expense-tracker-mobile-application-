/**
 * SPENDLY-289 — turning derived items and user entries into `TaxLine`s, the one
 * shape every tax screen and total reads.
 *
 * Rules:
 *   - The user's review always wins, and stays visible as `override`.
 *   - A review whose source value has since changed re-opens the item
 *     (`needs_review`, `source_changed`); it is never silently re-applied.
 *   - A missing value stays `null`. A total over a `null` is `null`, never a
 *     guess and never 0.
 */

import { roundMoney } from "@/shared/utils/money";
import type {
  TaxDerivedItem,
  TaxEntry,
  TaxItemState,
  TaxLine,
  TaxLineReason,
  TaxReview,
} from "../types";

export interface ResolveContext {
  /** Ids of live (not deleted) entries; a `replace` pointing elsewhere is void. */
  liveEntryIds: ReadonlySet<string>;
}

function sameAmount(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;
}

function derivedKey(item: TaxDerivedItem): string {
  return `${item.source.kind}:${item.source.id}`;
}

/** A derived item before or after the user's review. */
export function resolveDerivedLine(
  item: TaxDerivedItem,
  review: TaxReview | undefined,
  ctx: ResolveContext
): TaxLine {
  const base: TaxLine = {
    key: derivedKey(item),
    fy: item.fy,
    category: item.category,
    value: item.value,
    included: item.defaultIncluded,
    state: item.value === null ? "missing" : "pending",
    provenance: item.provenance,
    label: item.label,
    reasons: item.value === null ? ["value_missing"] : [],
  };
  if (!review || review.decision === "defer" || review.decision === "resolve") return base;

  const override: TaxLine["override"] = {
    reviewId: review.id,
    revision: review.revision,
    decision: review.decision,
    derivedCategory: item.category,
    derivedValue: item.value,
  };

  if (!sameAmount(review.sourceAmount, item.value)) {
    // The source moved after the user decided: show it again, keep the old decision visible.
    return { ...base, state: "needs_review", override, reasons: [...base.reasons, "source_changed"] };
  }

  const reasons: TaxLineReason[] = [...base.reasons];
  let { included, category } = base;
  let state: TaxItemState = item.value === null ? "missing" : "user_confirmed";

  switch (review.decision) {
    case "confirm":
      break;
    case "exclude":
      included = false;
      state = "user_confirmed";
      reasons.push("user_excluded");
      break;
    case "recategorize":
      category = review.category ?? category;
      reasons.push("user_recategorized");
      break;
    case "replace": {
      override.replacedBy = review.replacedBy;
      if (review.replacedBy && ctx.liveEntryIds.has(review.replacedBy)) {
        included = false;
        state = "user_confirmed";
        reasons.push("user_replaced");
      } else {
        // The replacing entry was deleted: count the derived value again, and ask.
        state = "needs_review";
        reasons.push("source_changed");
      }
      break;
    }
  }
  return { ...base, included, category, state, override, reasons };
}

/** A user entry as a line. `value` and `category` come from the kind's own rules (SPENDLY-290+). */
export function entryLine(
  entry: TaxEntry,
  args: { category: string; value: number | null; label: string; state?: TaxItemState }
): TaxLine {
  return {
    key: `tax_entry:${entry.id}`,
    fy: entry.fy,
    category: args.category,
    value: args.value,
    included: !entry.deletedAt,
    state: args.state ?? (args.value === null ? "missing" : "user_confirmed"),
    provenance: {
      origin: "user_entered",
      fy: entry.fy,
      sourceRef: { kind: "tax_entry", id: entry.id },
      ...(entry.documentIds?.length ? { documentIds: entry.documentIds } : {}),
    },
    label: args.label,
    reasons: args.value === null ? ["value_missing"] : [],
  };
}

export interface TaxLineTotal {
  /** `null` when any counted line has no value: the total is unknown, not partial. */
  total: number | null;
  countedLines: number;
  missingLines: number;
  needsReviewLines: number;
}

/** Sum of the counted lines of one year. Lines of another year are a bug, not data. */
export function sumTaxLines(lines: readonly TaxLine[]): TaxLineTotal {
  const fys = new Set(lines.map((l) => l.fy));
  if (fys.size > 1) throw new Error(`sumTaxLines: lines from ${fys.size} years`);

  let total = 0;
  let unknown = false;
  let countedLines = 0;
  let missingLines = 0;
  let needsReviewLines = 0;
  for (const line of lines) {
    if (line.state === "needs_review") needsReviewLines += 1;
    if (!line.included) continue;
    countedLines += 1;
    if (line.value === null) {
      unknown = true;
      missingLines += 1;
    } else {
      total += line.value;
    }
  }
  return {
    total: unknown ? null : roundMoney(total),
    countedLines,
    missingLines,
    needsReviewLines,
  };
}
