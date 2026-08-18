export type DpdpPurposeKey = "core" | "sms" | "nutritionAi" | "notifications";

export type DpdpPurposes = {
  /** Account, ledger, and syncing with Firebase — required to use Spendly. */
  core: boolean;
  /** Android SMS reading for bank/UPI transaction detection. */
  sms: boolean;
  /** Send food descriptions to Google Gemini for nutrition estimates. */
  nutritionAi: boolean;
  /** Local device notifications (bill reminders, SMS alerts). */
  notifications: boolean;
};

export type DpdpNominee = {
  name: string;
  email: string;
  phone: string;
  relationship: string;
};

export type DpdpConsent = {
  noticeVersion: string;
  acceptedAt: string;
  isAdult: boolean;
  purposes: DpdpPurposes;
  nominee?: DpdpNominee;
};

export const DEFAULT_DPDP_PURPOSES: DpdpPurposes = {
  core: false,
  sms: false,
  nutritionAi: false,
  notifications: false,
};

export const EMPTY_DPDP_NOMINEE: DpdpNominee = {
  name: "",
  email: "",
  phone: "",
  relationship: "",
};
