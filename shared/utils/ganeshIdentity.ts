import type { PandalMember } from "@/shared/types/ganesh";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePandalCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
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
