export const SETTINGS_SECTION_IDS = [
  "profile",
  "appearance",
  "preferences",
  "money",
  "accounts",
  "automation",
  "privacy",
  "about",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export const SETTINGS_GROUPS = [
  { id: "account", label: "Account" },
  { id: "app", label: "App" },
  { id: "money", label: "Money" },
  { id: "automation", label: "Automation" },
  { id: "security", label: "Security" },
  { id: "support", label: "Support" },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]["id"];

export type SettingsSectionMeta = {
  id: SettingsSectionId;
  group: SettingsGroupId;
  title: string;
  subtitle: string;
  keywords: string;
};

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: "profile",
    group: "account",
    title: "Profile",
    subtitle: "Username, account & sign out",
    keywords: "profile username email logout sign out account",
  },
  {
    id: "appearance",
    group: "app",
    title: "Appearance",
    subtitle: "Theme, accent & dashboard widgets",
    keywords: "theme dark light accent color preview widgets dashboard",
  },
  {
    id: "preferences",
    group: "app",
    title: "Preferences",
    subtitle: "Language, formats, haptics & defaults",
    keywords:
      "timezone currency language date number week navigation haptic upi investments lock months category view",
  },
  {
    id: "money",
    group: "money",
    title: "Categories & money",
    subtitle: "Taxonomy, monthly budget, budgets & goals",
    keywords: "budget category taxonomy goals piggy monthly spending",
  },
  {
    id: "accounts",
    group: "money",
    title: "Accounts",
    subtitle: "Account types & linked accounts",
    keywords: "bank credit card account types linked",
  },
  {
    id: "automation",
    group: "automation",
    title: "Automation",
    subtitle: "SMS, rules & bill reminders",
    keywords: "sms inbox auto categorize notifications credit card bills reminders",
  },
  {
    id: "privacy",
    group: "security",
    title: "Privacy & security",
    subtitle: "PIN, lock, duress & biometrics",
    keywords: "pin lock biometric duress fake privacy inactivity",
  },
  {
    id: "about",
    group: "support",
    title: "About",
    subtitle: "Setup checklist, version & updates",
    keywords: "about version update onboarding setup getting started",
  },
];

export function isSettingsSectionId(value: string | undefined): value is SettingsSectionId {
  return !!value && (SETTINGS_SECTION_IDS as readonly string[]).includes(value);
}

export function settingsSectionHref(id: SettingsSectionId): `/settings/${SettingsSectionId}` {
  return `/settings/${id}`;
}
