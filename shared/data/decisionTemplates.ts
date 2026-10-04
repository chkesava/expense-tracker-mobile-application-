/**
 * SPENDLY-364 — Money Decision templates.
 *
 * A template only shapes the *prompts* of the capture flow: placeholder
 * questions, and suggestions the user can tap to add. It never adds a
 * required field, never pre-fills an answer on the user's behalf, and never
 * reads or writes a financial record.
 *
 * Templates are versioned. A decision stores `templateId` + `templateVersion`,
 * and `getDecisionTemplate(id, version)` returns exactly that version, so a
 * decision made under v1 keeps showing v1's structure after v2 ships.
 * Rules: never edit a published version — add a new one with version + 1.
 */

import type { DecisionCategory } from "../types/decision";

export const DECISION_TEMPLATE_IDS = [
  "purchase",
  "loan_debt",
  "savings_goal",
  "investment",
  "insurance",
  "subscription",
  "income",
  "custom",
] as const;
export type DecisionTemplateId = (typeof DECISION_TEMPLATE_IDS)[number];

export interface DecisionTemplatePrompts {
  title: string;
  situation: string;
  goal: string;
  rationale: string;
  expected: string;
}

export interface DecisionTemplate {
  id: DecisionTemplateId;
  version: number;
  label: string;
  description: string;
  category: DecisionCategory;
  prompts: DecisionTemplatePrompts;
  /** Tap-to-add ideas. Nothing is added unless the user taps one. */
  suggestedConstraints: string[];
  suggestedAssumptions: string[];
  suggestedOptions: string[];
  /** Which kind of Spendly record is usually worth linking. */
  linkHint: "transactions" | "accounts";
}

const GENERIC: DecisionTemplatePrompts = {
  title: "What are you deciding?",
  situation: "What prompted this decision?",
  goal: "What do you want to achieve?",
  rationale: "Why this option, in your words",
  expected: "What do you expect to happen?",
};

/** Every published version of every template. Append only. */
const TEMPLATE_VERSIONS: readonly DecisionTemplate[] = [
  {
    id: "purchase",
    version: 1,
    label: "Purchase",
    description: "Buying something significant — a phone, a laptop, an appliance, a vehicle.",
    category: "purchase",
    prompts: {
      title: "e.g. Should I buy a new laptop this year?",
      situation: "What do you use now, and why is it not enough?",
      goal: "What does the purchase need to do for you?",
      rationale: "Why this option over waiting or the alternatives?",
      expected: "e.g. Lasts 5 years; no repair costs",
    },
    suggestedConstraints: ["Stay within my budget", "Pay without borrowing", "Keep my emergency fund untouched"],
    suggestedAssumptions: ["I'll use it for at least 3 years", "Prices won't drop much soon"],
    suggestedOptions: ["Buy now", "Wait for a sale", "Buy a cheaper model", "Don't buy"],
    linkHint: "transactions",
  },
  {
    id: "loan_debt",
    version: 1,
    label: "Loan or debt",
    description: "Taking, prepaying, refinancing or closing a loan or card balance.",
    category: "loan_debt",
    prompts: {
      title: "e.g. Should I prepay part of my car loan?",
      situation: "Which loan, and what changed?",
      goal: "e.g. Pay less interest, or be debt-free sooner",
      rationale: "Why this option, given your cash and other goals?",
      expected: "e.g. Close the loan a year early",
    },
    suggestedConstraints: ["Keep 3–6 months of expenses aside", "Monthly payment must stay affordable"],
    suggestedAssumptions: ["The interest rate stays about the same", "My income stays steady"],
    suggestedOptions: ["Prepay part of it", "Keep paying as scheduled", "Refinance", "Close it fully"],
    linkHint: "accounts",
  },
  {
    id: "savings_goal",
    version: 1,
    label: "Savings or goal",
    description: "How much to set aside, and for what — an emergency fund, a trip, a down payment.",
    category: "savings",
    prompts: {
      title: "e.g. How much should I save each month for a house?",
      situation: "What are you saving for, and by when?",
      goal: "e.g. ₹5 lakh by December 2028",
      rationale: "Why this amount and pace?",
      expected: "e.g. Reach the goal on time",
    },
    suggestedConstraints: ["Don't cut essential spending", "Keep it separate from daily money"],
    suggestedAssumptions: ["I can save the same amount every month"],
    suggestedOptions: ["Save a fixed amount monthly", "Save what's left each month", "Save a lump sum"],
    linkHint: "accounts",
  },
  {
    id: "investment",
    version: 1,
    label: "Investment",
    description: "Starting, changing or stopping an investment. Record your reasoning, not a tip.",
    category: "investment",
    prompts: {
      title: "e.g. Should I start a monthly SIP?",
      situation: "What's prompting this now?",
      goal: "What is this money for, and when will you need it?",
      rationale: "Why this option fits your own situation",
      expected: "What result would you consider reasonable, and over what time?",
    },
    suggestedConstraints: ["I may need this money within a set time", "I'm comfortable with only limited ups and downs"],
    suggestedAssumptions: ["I'll stay invested for the planned period"],
    suggestedOptions: ["Start now", "Start smaller", "Wait", "Don't invest in this"],
    linkHint: "accounts",
  },
  {
    id: "insurance",
    version: 1,
    label: "Insurance",
    description: "Buying, renewing, changing or dropping a policy.",
    category: "insurance",
    prompts: {
      title: "e.g. Should I renew my health insurance or switch plans?",
      situation: "What cover do you have now, and what changed?",
      goal: "What do you need the cover to protect?",
      rationale: "Why this choice of cover",
      expected: "e.g. Premium stays affordable; enough cover for a hospital stay",
    },
    suggestedConstraints: ["Premium within my budget", "Cover my family too"],
    suggestedAssumptions: ["My health needs stay about the same this year"],
    suggestedOptions: ["Renew as is", "Increase the cover", "Change the plan", "Let it lapse"],
    linkHint: "transactions",
  },
  {
    id: "subscription",
    version: 1,
    label: "Subscription or recurring cost",
    description: "Starting, keeping or cancelling something you pay for regularly.",
    category: "subscription",
    prompts: {
      title: "e.g. Should I keep paying for this streaming service?",
      situation: "What is it, and how often do you use it?",
      goal: "What do you want from it?",
      rationale: "Why keep, change or cancel it?",
      expected: "e.g. Use it every week, or save the monthly cost",
    },
    suggestedConstraints: ["Total subscriptions under a set amount"],
    suggestedAssumptions: ["I'll use it about as much as I do now"],
    suggestedOptions: ["Keep it", "Switch to a cheaper plan", "Pause it", "Cancel it"],
    linkHint: "transactions",
  },
  {
    id: "income",
    version: 1,
    label: "Salary or income",
    description: "A job offer, a raise, freelance work, or changing how you're paid.",
    category: "income",
    prompts: {
      title: "e.g. Should I accept the new job offer?",
      situation: "What's on the table?",
      goal: "What matters most to you here?",
      rationale: "Why this choice, including the non-money parts",
      expected: "e.g. Take-home pay goes up; similar hours",
    },
    suggestedConstraints: ["Take-home pay must cover my fixed costs"],
    suggestedAssumptions: ["The offer terms are as written", "My costs won't change much"],
    suggestedOptions: ["Accept", "Negotiate", "Stay where I am"],
    linkHint: "transactions",
  },
  {
    id: "custom",
    version: 1,
    label: "Something else",
    description: "Start from a blank decision.",
    category: "other",
    prompts: GENERIC,
    suggestedConstraints: [],
    suggestedAssumptions: [],
    suggestedOptions: [],
    linkHint: "transactions",
  },
];

/** The newest version of each template — what a new decision uses. */
export const DECISION_TEMPLATES: readonly DecisionTemplate[] = DECISION_TEMPLATE_IDS.map((id) => {
  const versions = TEMPLATE_VERSIONS.filter((t) => t.id === id);
  return versions.reduce((a, b) => (b.version > a.version ? b : a));
});

export function isDecisionTemplateId(value: unknown): value is DecisionTemplateId {
  return typeof value === "string" && (DECISION_TEMPLATE_IDS as readonly string[]).includes(value);
}

/**
 * The template a decision was created with, at the version it was created
 * with. Falls back to the latest version of the same template, then to the
 * blank prompts, so an unknown id never breaks the screen.
 */
export function getDecisionTemplate(id?: string, version?: number): DecisionTemplate {
  if (id && isDecisionTemplateId(id)) {
    const exact = version === undefined ? undefined : TEMPLATE_VERSIONS.find((t) => t.id === id && t.version === version);
    return exact ?? DECISION_TEMPLATES.find((t) => t.id === id)!;
  }
  return DECISION_TEMPLATES.find((t) => t.id === "custom")!;
}

/** Test seam: every published version. */
export function allDecisionTemplateVersions(): readonly DecisionTemplate[] {
  return TEMPLATE_VERSIONS;
}
