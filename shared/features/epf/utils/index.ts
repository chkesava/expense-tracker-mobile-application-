/**
 * EPF pure helpers — KAN-65.
 *
 * All EPF decision logic lives here rather than in `hooks/useEpf.ts`, because
 * `vitest.config.ts` only runs `shared/**`, `services/**` and `lib/**`. The
 * hook stays a thin Firestore shell so that everything worth testing is
 * actually tested.
 *
 * Must stay free of React and Firebase imports — `tsconfig.shared.json`
 * compiles this tree on its own.
 */

import type {
  EpfEmploymentState,
  EpfEmploymentStatus,
  EpfEstablishment,
  EpfEstablishmentConflict,
  EpfProfile,
} from "@/shared/features/epf/types";
import { EPF_PROFILE_DOC_ID } from "@/shared/features/epf/types";

/** Sentinel for "still employed" in date comparisons. */
const OPEN_ENDED = "9999-12-31";

const MASK_CHAR = "•";

/** "1001 2345-6789" -> "100123456789". */
export function normalizeUan(raw: string): string {
  return (raw ?? "").replace(/[\s-]/g, "").trim();
}

export function isValidUan(value: string): boolean {
  return /^\d{12}$/.test(normalizeUan(value));
}

/** "100123456789" -> "1001 2345 6789". Reveal view only. */
export function formatUan(uan: string): string {
  const normalized = normalizeUan(uan);
  if (!/^\d{12}$/.test(normalized)) return normalized;
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 8)} ${normalized.slice(8)}`;
}

/**
 * Mask all but the last `visible` characters.
 *
 * Shoulder-surfing protection, not a security control — the full value is
 * still readable by anyone holding the user's session.
 */
export function maskIdentifier(value: string | undefined | null, visible = 4): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (raw.length <= visible) return MASK_CHAR.repeat(raw.length);
  return MASK_CHAR.repeat(raw.length - visible) + raw.slice(raw.length - visible);
}

/** "100123456789" -> "•••• •••• 6789". */
export function maskUan(uan: string): string {
  const normalized = normalizeUan(uan);
  if (!/^\d{12}$/.test(normalized)) return maskIdentifier(normalized);
  return `${MASK_CHAR.repeat(4)} ${MASK_CHAR.repeat(4)} ${normalized.slice(8)}`;
}

export function deriveEmploymentStatus(dateLeft?: string | null): EpfEmploymentStatus {
  return dateLeft ? "previous" : "current";
}

export function isOpenEnded(establishment: {
  dateLeft?: string | null;
}): boolean {
  return !establishment.dateLeft;
}

/**
 * Build an {@link EpfProfile} from a raw Firestore document — KAN-73.
 *
 * `useEpf.ts` used to cast the snapshot straight to `EpfProfile`, which asserts
 * fields a document written by an earlier build may not carry. The profile is
 * read on every dashboard visit through `useEpfNetWorth`, so a missing field
 * became `undefined` at runtime while the type claimed otherwise.
 *
 * `activeEstablishmentId` is deliberately normalized to `null` rather than
 * dropped: absent and "explicitly cleared" mean the same thing for a lock hint,
 * and collapsing them removes a distinction nothing should depend on.
 */
export function normalizeEpfProfile(
  id: string,
  raw: Record<string, unknown>
): EpfProfile {
  const activeEstablishmentId =
    typeof raw.activeEstablishmentId === "string" && raw.activeEstablishmentId
      ? raw.activeEstablishmentId
      : null;

  return {
    id,
    employeeName: typeof raw.employeeName === "string" ? raw.employeeName : "",
    uan: typeof raw.uan === "string" ? raw.uan : "",
    activeEstablishmentId,
    notes: typeof raw.notes === "string" && raw.notes ? raw.notes : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Tolerant read: repairs documents written by an older or buggier path.
 *
 * Recomputes `employmentStatus` from `dateLeft` (the source of truth),
 * defaults `profileId`, and converts an empty-string `dateLeft` to undefined
 * so "" never reads as "has left".
 */
export function normalizeEstablishment(
  id: string,
  raw: Record<string, unknown>
): EpfEstablishment {
  const dateLeftRaw = typeof raw.dateLeft === "string" ? raw.dateLeft.trim() : "";
  const dateLeft = dateLeftRaw.length > 0 ? dateLeftRaw : undefined;

  return {
    id,
    profileId: typeof raw.profileId === "string" && raw.profileId ? raw.profileId : EPF_PROFILE_DOC_ID,
    employerName: typeof raw.employerName === "string" ? raw.employerName : "",
    establishmentNumber:
      typeof raw.establishmentNumber === "string" ? raw.establishmentNumber : "",
    memberId: typeof raw.memberId === "string" ? raw.memberId : "",
    dateJoined: typeof raw.dateJoined === "string" ? raw.dateJoined : "",
    dateLeft,
    employmentStatus: deriveEmploymentStatus(dateLeft),
    archived: raw.archived === true ? true : undefined,
    notes: typeof raw.notes === "string" && raw.notes ? raw.notes : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/** Presentation state. A future joining date reads as "upcoming", not "current". */
export function deriveEmploymentState(
  establishment: { dateJoined: string; dateLeft?: string | null; archived?: boolean },
  todayKey: string
): EpfEmploymentState {
  if (establishment.archived) return "archived";
  if (establishment.dateLeft) return "previous";
  if (establishment.dateJoined > todayKey) return "upcoming";
  return "current";
}

export function isArchived(establishment: { archived?: boolean }): boolean {
  return establishment.archived === true;
}

/** Live (non-archived) records first, archived last. */
export function splitArchivedEstablishments(list: EpfEstablishment[]): {
  live: EpfEstablishment[];
  archived: EpfEstablishment[];
} {
  return {
    live: list.filter((item) => !isArchived(item)),
    archived: list.filter((item) => isArchived(item)),
  };
}

/** Archived records are history, never the current employment. */
export function findActiveEstablishment(
  establishments: EpfEstablishment[]
): EpfEstablishment | null {
  return establishments.find((item) => isOpenEnded(item) && !isArchived(item)) ?? null;
}

/**
 * Half-open interval overlap over [dateJoined, dateLeft ?? infinity).
 *
 * Leaving on 2024-03-31 and joining another employer on 2024-03-31 is a normal
 * handover and is deliberately NOT an overlap.
 */
export function periodsOverlap(
  a: { dateJoined: string; dateLeft?: string | null },
  b: { dateJoined: string; dateLeft?: string | null }
): boolean {
  const aEnd = a.dateLeft || OPEN_ENDED;
  const bEnd = b.dateLeft || OPEN_ENDED;
  return a.dateJoined < bEnd && b.dateJoined < aEnd;
}

/**
 * The single write guard. Called before every create and update.
 *
 * `multiple_current` is reported ahead of `overlapping_period` so the user
 * gets the actionable message ("close your current employment") rather than a
 * generic overlap complaint.
 */
export function validateEstablishmentAgainstExisting(
  existing: EpfEstablishment[],
  candidate: { id?: string; dateJoined: string; dateLeft?: string | null }
): EpfEstablishmentConflict {
  if (candidate.dateLeft && candidate.dateLeft < candidate.dateJoined) {
    return {
      ok: false,
      code: "left_before_joined",
      message: "Leaving date must be on or after the joining date.",
    };
  }

  // Archived records are history: they neither hold the current-employment
  // lock nor block a new period from overlapping their dates.
  const others = existing.filter((item) => item.id !== candidate.id && !isArchived(item));

  if (isOpenEnded(candidate)) {
    const otherCurrent = others.find((item) => isOpenEnded(item));
    if (otherCurrent) {
      return {
        ok: false,
        code: "multiple_current",
        message: `Close your current employment at ${otherCurrent.employerName || "your other establishment"} before adding a new one.`,
        conflictingId: otherCurrent.id,
      };
    }
  }

  const overlapping = others.find((item) => periodsOverlap(item, candidate));
  if (overlapping) {
    return {
      ok: false,
      code: "overlapping_period",
      message: `These dates overlap your employment at ${overlapping.employerName || "another establishment"}.`,
      conflictingId: overlapping.id,
    };
  }

  return { ok: true };
}

/**
 * Archived last, then current employment, then most recently joined, then
 * employer name.
 */
export function sortEstablishments(list: EpfEstablishment[]): EpfEstablishment[] {
  return [...list].sort((a, b) => {
    const aArchived = isArchived(a);
    const bArchived = isArchived(b);
    if (aArchived !== bArchived) return aArchived ? 1 : -1;

    const aOpen = isOpenEnded(a);
    const bOpen = isOpenEnded(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (a.dateJoined !== b.dateJoined) return a.dateJoined < b.dateJoined ? 1 : -1;
    return a.employerName.localeCompare(b.employerName);
  });
}

/** Whole months served between joining and (dateLeft ?? today). Never negative. */
export function establishmentDurationMonths(
  establishment: { dateJoined: string; dateLeft?: string | null },
  todayKey: string
): number {
  const start = establishment.dateJoined;
  const end = establishment.dateLeft || todayKey;
  if (!start || !end || end < start) return 0;

  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);

  let months = (endYear - startYear) * 12 + (endMonth - startMonth);
  if (endDay < startDay) months -= 1;
  return Math.max(0, months);
}
