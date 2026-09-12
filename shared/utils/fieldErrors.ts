/**
 * Validation issues → per-field error messages — KAN-73.
 *
 * This reducer was written out eight times across `components/epf/`: six
 * identical copies over zod's `issue.path`, and two more over the EPF domain
 * issue shape (`issue.field`, from `EpfTransferIssue` / `EpfReconciliationIssue`).
 * One function now covers both, because the two shapes only ever differed in
 * where the field name was stored.
 *
 * Forms in this codebase hold `Record<string, string>` in state and read it as
 * `fieldErrors` — see `EpfProfileFormModal` and friends. This returns exactly
 * that shape.
 */

/** A zod issue, narrowed to what this needs. */
export interface PathIssue {
  path: PropertyKey[];
  message: string;
}

/** An EPF domain issue, narrowed to what this needs. */
export interface FieldIssue {
  field?: string;
  message: string;
}

function fieldNameOf(issue: PathIssue | FieldIssue): string | undefined {
  const asField = issue as Partial<FieldIssue>;
  if (typeof asField.field === "string") return asField.field || undefined;

  // `path[0] != null` rather than a truthiness check: the copies this replaces
  // used `if (issue.path[0])`, which would silently drop array index 0. No EPF
  // schema has a top-level array, so nothing changes today — but the truthy
  // version is a trap, not a rule.
  const head = (issue as Partial<PathIssue>).path?.[0];
  return head == null ? undefined : String(head);
}

/**
 * Later issues win for the same field, matching the loops this replaces.
 * Issues with no field are dropped — they have nowhere to render.
 */
export function fieldErrorsFromIssues(
  issues: readonly (PathIssue | FieldIssue)[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const field = fieldNameOf(issue);
    if (field !== undefined) out[field] = issue.message;
  }
  return out;
}
