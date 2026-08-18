import {
  DPDP_NOTICE_VERSION,
  dpdpConfig,
  formatFiduciaryName,
  formatGrievanceAddress,
  formatGrievanceEmail,
} from "@/lib/dpdpConfig";

export type LegalSection = {
  heading: string;
  body: string;
};

export function getPrivacyNoticeVersion(): string {
  return DPDP_NOTICE_VERSION;
}

export function getPrivacyNoticeTitle(): string {
  return "Spendly Privacy Notice";
}

export function getPrivacyNoticeIntro(): string {
  return (
    `This notice is given under the Digital Personal Data Protection Act, 2023 ` +
    `(“DPDP Act”) and the DPDP Rules. ${formatFiduciaryName()} is the Data Fiduciary ` +
    `for Spendly. Please read it before creating an account or continuing to use the app. ` +
    `This is an engineering notice for in-app consent — have counsel review the text ` +
    `before you publish it.`
  );
}

export function getPrivacyNoticeSections(): LegalSection[] {
  const name = formatFiduciaryName();
  return [
    {
      heading: "Who we are",
      body:
        `${name} provides Spendly, a personal finance (and optional nutrition) app. ` +
        `We process digital personal data to provide the service you ask for. ` +
        `Notice version ${DPDP_NOTICE_VERSION}.`,
    },
    {
      heading: "Personal data we process",
      body:
        "Account identity: email address, password (stored by Google Firebase Authentication), " +
        "display name, username, and (if you use Google Sign-In) your Google profile photo URL.\n\n" +
        "Financial data you enter or that we derive from your inputs: expenses, income, accounts " +
        "(including institution names and last four digits if you add them), credit-card bills, " +
        "budgets, goals, subscriptions, SIPs, investments, borrowings, receivables, vaults, " +
        "split bills, notes, tags, and UPI ID if you save one.\n\n" +
        "Nutrition and health (only if you use the Nutrition workspace): age, gender, height, " +
        "weight, activity level, diet preference, allergies, meals, and weight history.\n\n" +
        "Device and security: app PIN hashes, optional duress PIN hash, optional biometric unlock " +
        "flag stored on this device, language and display preferences.\n\n" +
        "Android SMS (only if you turn on SMS automation and grant OS permission): Spendly reads " +
        "SMS on this device to detect bank and UPI transactions. Raw SMS body, sender, and timestamp " +
        "stay on the device. We do not upload raw SMS to our servers. Parsed amount, merchant, and " +
        "date may be saved as a normal expense or income in your ledger.\n\n" +
        "Camera and photos (only when you use receipt or barcode scan): images stay on this device " +
        "and are not uploaded. Receipt text recognition in this app is local/simulated.\n\n" +
        "We do not collect precise location, contacts, advertising IDs, or analytics SDK events.",
    },
    {
      heading: "Purpose of processing",
      body:
        "Core purpose: create and secure your account, sync your ledger across devices, and show " +
        "dashboards, budgets, reminders, and exports you request. Without this processing we cannot " +
        "provide Spendly.\n\n" +
        "Optional purposes (separate consent, can be withdrawn in Settings → Data & privacy):\n" +
        "• SMS automation — detect transactions from bank/UPI SMS on Android.\n" +
        "• Nutrition AI — send a food description you type to Google Gemini to estimate nutrients.\n" +
        "• Notifications — local reminders for credit-card bills and detected SMS transactions.\n\n" +
        "We do not sell personal data or use it for third-party advertising.",
    },
    {
      heading: "Who we share data with",
      body:
        "Google Firebase (Authentication, Firestore, Storage) hosts accounts and the data you save, " +
        "which may be processed outside India.\n\n" +
        "Google Sign-In, if you choose it, receives the sign-in request you start on the device.\n\n" +
        "Google Gemini, only if you consent to Nutrition AI, receives the food text you submit.\n\n" +
        "Payment request links you create are world-readable by design: anyone with the link can see " +
        "the amount, payee name, and UPI ID. Delete or cancel a request when it is no longer needed.\n\n" +
        "Vault and split-bill members you add can see the shared expenses you put in that vault or split.",
    },
    {
      heading: "Retention",
      body:
        "We keep personal data for as long as your account exists and the purpose continues, or until " +
        "you withdraw consent or ask us to erase it (including by deleting your account), unless a law " +
        "requires a longer period. Raw SMS is not retained in the cloud. Local SMS queues on the device " +
        "can be cleared when you turn SMS automation off.",
    },
    {
      heading: "Your rights (Data Principal)",
      body:
        "You may: access a copy of your personal data; correct or update it; erase it (including by " +
        "deleting your account); withdraw optional consents as easily as you gave them; nominate " +
        "another person to exercise rights in case of death or incapacity; and raise a grievance.\n\n" +
        "Use Settings → Data & privacy in the app. Withdrawing core consent means we cannot keep " +
        "providing the service — you will be asked to delete the account.",
    },
    {
      heading: "Children",
      body:
        "Spendly is for people aged 18 or older. We do not knowingly offer the service to children. " +
        "If you are under 18, do not create an account.",
    },
    {
      heading: "Security",
      body:
        "We use HTTPS in transit, Firebase security rules so other users cannot read your personal " +
        "ledger, hashed app PINs, and Android backup disabled for this app. No security measure is " +
        "perfect. Tell us promptly if you believe your account is compromised.",
    },
    {
      heading: "Grievance and the Data Protection Board",
      body:
        `Write to ${name} at ${formatGrievanceEmail()}. Postal: ${formatGrievanceAddress()}. ` +
        `We aim to respond within ${dpdpConfig.grievanceSlaDays} days.\n\n` +
        `If your grievance is not resolved, you may complain to the ${dpdpConfig.dataProtectionBoardName}. ` +
        `See ${dpdpConfig.dataProtectionBoardUrl}.`,
    },
  ];
}

export function privacyNoticePlainText(): string {
  const parts = [
    getPrivacyNoticeTitle(),
    `Version ${getPrivacyNoticeVersion()}`,
    "",
    getPrivacyNoticeIntro(),
    ...getPrivacyNoticeSections().flatMap((section) => [
      "",
      section.heading,
      section.body,
    ]),
  ];
  return parts.join("\n");
}
