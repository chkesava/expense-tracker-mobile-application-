import { DPDP_NOTICE_VERSION, formatFiduciaryName } from "@/lib/dpdpConfig";
import type { LegalSection } from "@/legal/privacyNotice";

export function getTermsTitle(): string {
  return "Spendly Terms of Use";
}

export function getTermsVersion(): string {
  return DPDP_NOTICE_VERSION;
}

export function getTermsIntro(): string {
  return (
    `These terms govern your use of Spendly, provided by ${formatFiduciaryName()}. ` +
    `By creating an account you agree to them. They are not a substitute for legal advice.`
  );
}

export function getTermsSections(): LegalSection[] {
  return [
    {
      heading: "The service",
      body:
        "Spendly is a personal finance tracker with an optional nutrition workspace. " +
        "It is provided as-is. Figures, categories, and AI estimates are for your own organisation — " +
        "they are not professional financial, tax, or medical advice.",
    },
    {
      heading: "Eligibility",
      body:
        "You must be 18 or older and able to form a contract. You are responsible for the accuracy " +
        "of data you enter and for keeping your password and device unlock methods safe.",
    },
    {
      heading: "Acceptable use",
      body:
        "Do not misuse the app, attempt to access another person’s account, or use SMS automation " +
        "on a device or inbox you are not authorised to read. Public payment links must not be used " +
        "to collect money by deception.",
    },
    {
      heading: "Accounts",
      body:
        "You may delete your account at any time from Settings → Data & privacy. We may suspend " +
        "accounts that violate these terms or that we are required to suspend by law.",
    },
    {
      heading: "Privacy",
      body:
        "Processing of personal data is described in the Privacy Notice. Optional features " +
        "(SMS automation, Nutrition AI, notifications) require separate consent.",
    },
  ];
}

export function termsPlainText(): string {
  const parts = [
    getTermsTitle(),
    `Version ${getTermsVersion()}`,
    "",
    getTermsIntro(),
    ...getTermsSections().flatMap((section) => ["", section.heading, section.body]),
  ];
  return parts.join("\n");
}
