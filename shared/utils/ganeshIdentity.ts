import type { PandalMember } from "@/shared/types/ganesh";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePandalCode(length = 4): string {
  let suffix = "";
  for (let i = 0; i < length; i += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `GNSH${suffix}`;
}

export function formatPandalCode(code: string): string {
  const normalized = normalizePandalCode(code);
  if (normalized.startsWith("GNSH") && normalized.length > 4) {
    return `GNSH-${normalized.slice(4)}`;
  }
  return normalized;
}

export function normalizePandalCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function memberDisplayName(
  members: Array<Pick<PandalMember, "userId" | "displayName">>,
  uid?: string | null
): string {
  if (!uid) return "Unknown";
  return members.find((member) => member.userId === uid)?.displayName || "Member";
}

/**
 * The one date shape Ganesh accepts: YYYY-MM-DD, with real month and day
 * ranges. `todayDateInput()` below produces it.
 *
 * `firestore.rules` mirrors this in `okDate()` (GS-041). Keep the two in step:
 * a client check looser than the rules means the user is told their input is
 * fine and then gets a bare permission error from the server, which is worse
 * than either check alone.
 *
 * Month and day ranges only — Feb 30 passes both. Calendar correctness is not
 * what a shape check is for.
 */
export const GANESH_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function todayDateInput(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatGaneshWhen(value?: {
  seconds?: number;
  toDate?: () => Date;
} | null, fallbackDate?: string): string {
  const date = value?.toDate?.()
    ?? (typeof value?.seconds === "number" ? new Date(value.seconds * 1000) : null)
    ?? (fallbackDate ? new Date(`${fallbackDate}T00:00:00`) : null);
  if (!date || Number.isNaN(date.getTime())) return fallbackDate ?? "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function indianPhoneToE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  throw new Error("Enter a valid 10-digit Indian mobile number.");
}
