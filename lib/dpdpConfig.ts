/**
 * DPDP Act 2023 / DPDP Rules 2025 — Data Fiduciary contact and notice version.
 *
 * Fill in organisation name, grievance email, and address before Play Store
 * listing. Empty strings render as explicit placeholders in the Privacy Notice.
 */

import { env } from "@/lib/env";

/** Bump this to re-prompt signed-in users with the updated notice. */
export const DPDP_NOTICE_VERSION = "1.0";

function pageUrl(path: string): string {
  const base = env.publicAppUrl.replace(/\/$/, "");
  return base ? `${base}${path}` : "";
}

export const dpdpConfig = {
  /** Legal name of the Data Fiduciary (organisation). */
  fiduciaryName: "Spendly",
  /**
   * Public grievance contact. Leave empty until you publish a real address —
   * the notice will say contact details are to be published by the Data Fiduciary.
   */
  grievanceEmail: "",
  grievanceAddress: "",
  /** Expected days to respond to a grievance (DPDP Rules — confirm with counsel). */
  grievanceSlaDays: 7,
  dataProtectionBoardName: "Data Protection Board of India",
  dataProtectionBoardUrl: "https://www.dpdpa.gov.in",
  get privacyPolicyUrl(): string {
    return pageUrl("/privacy");
  },
  get termsUrl(): string {
    return pageUrl("/terms");
  },
  get deleteAccountUrl(): string {
    return pageUrl("/account-deletion");
  },
} as const;

export function formatFiduciaryName(): string {
  return dpdpConfig.fiduciaryName.trim() || "Spendly";
}

export function formatGrievanceEmail(): string {
  const email = dpdpConfig.grievanceEmail.trim();
  return email || "Contact details to be published by the Data Fiduciary";
}

export function formatGrievanceAddress(): string {
  const address = dpdpConfig.grievanceAddress.trim();
  return address || "Postal address to be published by the Data Fiduciary";
}

export function hasPublishedGrievanceEmail(): boolean {
  return Boolean(dpdpConfig.grievanceEmail.trim());
}
