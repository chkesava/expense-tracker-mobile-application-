import {
  DEFAULT_DPDP_PURPOSES,
  EMPTY_DPDP_NOMINEE,
  type DpdpConsent,
  type DpdpNominee,
  type DpdpPurposes,
} from "../types/dpdp";
import { DPDP_NOTICE_VERSION } from "../../lib/dpdpConfig";

const PIN_KEYS = new Set(["privacyPin", "fakePin"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseDpdpPurposes(value: unknown): DpdpPurposes {
  const record = asRecord(value);
  return {
    core: asBoolean(record?.core),
    sms: asBoolean(record?.sms),
    nutritionAi: asBoolean(record?.nutritionAi),
    notifications: asBoolean(record?.notifications),
  };
}

export function parseDpdpNominee(value: unknown): DpdpNominee | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const nominee: DpdpNominee = {
    name: asString(record.name).trim(),
    email: asString(record.email).trim(),
    phone: asString(record.phone).trim(),
    relationship: asString(record.relationship).trim(),
  };
  if (!nominee.name && !nominee.email && !nominee.phone) return undefined;
  return nominee;
}

/**
 * Reads a `dpdp` object from a Firestore user document (or a `{ dpdp }` wrapper).
 */
export function parseDpdpConsent(data: unknown): DpdpConsent | null {
  const root = asRecord(data);
  if (!root) return null;
  const raw = asRecord(root.dpdp) ?? (root.noticeVersion ? root : null);
  if (!raw) return null;

  const noticeVersion = asString(raw.noticeVersion).trim();
  const acceptedAt = asString(raw.acceptedAt).trim();
  if (!noticeVersion || !acceptedAt) return null;

  return {
    noticeVersion,
    acceptedAt,
    isAdult: asBoolean(raw.isAdult),
    purposes: parseDpdpPurposes(raw.purposes),
    nominee: parseDpdpNominee(raw.nominee),
  };
}

export function needsNoticeAcceptance(consent: DpdpConsent | null): boolean {
  if (!consent) return true;
  if (!consent.isAdult) return true;
  if (consent.noticeVersion !== DPDP_NOTICE_VERSION) return true;
  if (!consent.purposes.core) return true;
  return false;
}

export function buildAcceptedConsent(existing: DpdpConsent | null): DpdpConsent {
  return {
    noticeVersion: DPDP_NOTICE_VERSION,
    acceptedAt: new Date().toISOString(),
    isAdult: true,
    purposes: {
      ...DEFAULT_DPDP_PURPOSES,
      ...(existing?.purposes ?? {}),
      core: true,
    },
    nominee: existing?.nominee,
  };
}

export function mergeDpdpPurposes(
  existing: DpdpConsent | null,
  patch: Partial<DpdpPurposes>
): DpdpPurposes {
  return {
    ...DEFAULT_DPDP_PURPOSES,
    ...(existing?.purposes ?? {}),
    ...patch,
  };
}

export function mergeNominee(
  existing: DpdpNominee | undefined,
  patch: Partial<DpdpNominee>
): DpdpNominee {
  return {
    ...EMPTY_DPDP_NOMINEE,
    ...(existing ?? {}),
    ...patch,
  };
}

/** Strip app-lock PIN hashes before a Data Principal access export. */
export function redactSensitiveUserFields(
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!data) return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (PIN_KEYS.has(key)) continue;
    next[key] = value;
  }
  return next;
}
