/**
 * SPENDLY-370 — retrospective insights from the user's own decision history.
 *
 * Descriptive only: each insight says what the records show, states exactly
 * how it was calculated (`basis`) and lists the decisions behind it
 * (`decisionIds`) so the user can drill in. Nothing here recommends a
 * provider, product or investment, and nothing judges a decision — outcome
 * verdicts come only from the user's own assessments.
 *
 * Small data: percentages need at least `MIN_FOR_PERCENT` items behind them;
 * below that, plain counts are shown. Medians need at least `MIN_FOR_MEDIAN`.
 */

import type { DecisionCategory, MoneyDecision } from "../types/decision";
import { decisionCategoryLabel } from "./decisionModel";
import { ASSESSMENT_LABELS, expectedForReview, outcomeVariance } from "./decisionOutcome";

export const MIN_FOR_PERCENT = 5;
export const MIN_FOR_MEDIAN = 3;
export const MIN_FOR_THEME = 3;

export type DecisionInsightKind =
  | "by_category"
  | "open_vs_closed"
  | "review_completion"
  | "expected_vs_actual"
  | "your_assessments"
  | "themes"
  | "time_to_decide"
  | "time_to_review"
  | "lessons";

export interface DecisionInsight {
  id: string;
  kind: DecisionInsightKind;
  title: string;
  body: string;
  /** How it was calculated. Always present. */
  basis: string;
  /** Decisions behind it; never empty. */
  decisionIds: string[];
}

const DAY = 86_400_000;

function share(part: number, whole: number): string {
  return whole >= MIN_FOR_PERCENT ? `${Math.round((part / whole) * 100)}%` : `${part} of ${whole}`;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function days(n: number): string {
  const d = Math.round(n);
  return `${d} day${d === 1 ? "" : "s"}`;
}

const isMade = (d: MoneyDecision) => {
  const s = d.status === "archived" ? d.archivedFromStatus ?? "draft" : d.status;
  return s === "decided" || s === "tracking" || s === "reviewed" || s === "closed";
};
const isReviewed = (d: MoneyDecision) => {
  const s = d.status === "archived" ? d.archivedFromStatus ?? "draft" : d.status;
  return s === "reviewed" || s === "closed";
};

const STOP = new Set([
  "should", "would", "could", "about", "with", "from", "this", "that", "what", "which", "when", "where", "into", "over",
  "more", "less", "than", "then", "them", "they", "their", "have", "will", "your", "mine", "next", "year", "month", "decide", "decision",
]);

function themeWords(title: string): string[] {
  return [...new Set(title.toLocaleLowerCase().split(/[^a-zऀ-ॿ]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
}

export function buildDecisionInsights(all: readonly MoneyDecision[]): DecisionInsight[] {
  const decisions = all.filter((d) => d.status !== "draft");
  const out: DecisionInsight[] = [];
  if (decisions.length === 0) return out;

  // 1. By category
  const byCat = new Map<DecisionCategory, MoneyDecision[]>();
  for (const d of decisions) {
    const list = byCat.get(d.category);
    if (list) list.push(d);
    else byCat.set(d.category, [d]);
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const [topCat, topList] = cats[0];
  const lead = cats.length === 1 || topList.length > cats[1][1].length;
  out.push({
    id: "by_category",
    kind: "by_category",
    title: lead && topList.length >= 2 ? `Most of your decisions are about ${decisionCategoryLabel(topCat).toLocaleLowerCase()}` : "Your decisions by category",
    body: cats.map(([c, list]) => `${decisionCategoryLabel(c)}: ${list.length}`).join(" · "),
    basis: "Counts every decision you've moved past draft, including archived ones, by its category.",
    decisionIds: (lead ? topList : decisions).map((d) => d.id),
  });

  // 2. Open vs closed
  const open = decisions.filter((d) => ["considering", "decided", "tracking"].includes(d.status));
  const done = decisions.filter((d) => d.status === "reviewed" || d.status === "closed");
  if (open.length + done.length > 0) {
    out.push({
      id: "open_vs_closed",
      kind: "open_vs_closed",
      title: `${open.length} open, ${done.length} reviewed or closed`,
      body: open.length > 0 ? "Open decisions are ones you're still considering or tracking." : "Everything you've decided has been looked back on.",
      basis: "Open means considering, decided or tracking; done means reviewed or closed. Archived decisions are left out.",
      decisionIds: [...open, ...done].map((d) => d.id),
    });
  }

  // 3. Review completion
  const made = decisions.filter(isMade);
  if (made.length > 0) {
    const reviewed = made.filter((d) => isReviewed(d) || d.outcome);
    out.push({
      id: "review_completion",
      kind: "review_completion",
      title: `You've looked back on ${share(reviewed.length, made.length)} of the decisions you made`,
      body: reviewed.length < made.length ? `${made.length - reviewed.length} still have no recorded outcome or review.` : "Every decision you made has a review or an outcome.",
      basis: `Decisions you marked decided or later; "looked back" means reviewed, closed or with an outcome recorded.${made.length < MIN_FOR_PERCENT ? ` Shown as counts — there are fewer than ${MIN_FOR_PERCENT} so far.` : ""}`,
      decisionIds: made.map((d) => d.id),
    });
  }

  // 4. Expected vs actual, only where comparable
  const comparable = decisions
    .map((d) => ({ d, v: outcomeVariance(expectedForReview(d).expected, d.outcome) }))
    .filter((x) => x.d.outcome && x.v.ok) as Array<{ d: MoneyDecision; v: Extract<ReturnType<typeof outcomeVariance>, { ok: true }> }>;
  if (comparable.length >= MIN_FOR_MEDIAN) {
    const more = comparable.filter((x) => x.v.delta > 0).length;
    const less = comparable.filter((x) => x.v.delta < 0).length;
    const same = comparable.length - more - less;
    out.push({
      id: "expected_vs_actual",
      kind: "expected_vs_actual",
      title: `In ${comparable.length} decisions with amounts on both sides`,
      body: `The actual amount was more than you expected ${more} time${more === 1 ? "" : "s"}, less ${less} time${less === 1 ? "" : "s"}${same ? `, and the same ${same} time${same === 1 ? "" : "s"}` : ""}.`,
      basis: `Only decisions where the expected amount (as you set it when deciding) and the actual amount are in the same unit. Needs at least ${MIN_FOR_MEDIAN}.`,
      decisionIds: comparable.map((x) => x.d.id),
    });
  }

  // 5. The user's own assessments
  const assessed = decisions.filter((d) => d.outcome?.userAssessment);
  if (assessed.length > 0) {
    const counts = new Map<string, number>();
    for (const d of assessed) counts.set(d.outcome!.userAssessment!, (counts.get(d.outcome!.userAssessment!) ?? 0) + 1);
    out.push({
      id: "your_assessments",
      kind: "your_assessments",
      title: "How you said things turned out",
      body: [...counts.entries()].map(([k, n]) => `${ASSESSMENT_LABELS[k as keyof typeof ASSESSMENT_LABELS]}: ${n}`).join(" · "),
      basis: "Your own assessments when you recorded outcomes. Spendly doesn't rate decisions.",
      decisionIds: assessed.map((d) => d.id),
    });
  }

  // 6. Repeated themes in your own titles
  const wordMap = new Map<string, MoneyDecision[]>();
  for (const d of decisions) {
    for (const w of themeWords(d.title)) {
      const list = wordMap.get(w);
      if (list) list.push(d);
      else wordMap.set(w, [d]);
    }
  }
  const themes = [...wordMap.entries()].filter(([, list]) => list.length >= MIN_FOR_THEME).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 3);
  for (const [word, list] of themes) {
    out.push({
      id: `theme:${word}`,
      kind: "themes",
      title: `"${word}" comes up often`,
      body: `${list.length} of your decisions mention it.`,
      basis: `Words of four or more letters that appear in the titles of at least ${MIN_FOR_THEME} decisions.`,
      decisionIds: list.map((d) => d.id),
    });
  }

  // 7. Time to decide (started → decided)
  const decidedTimes = decisions.filter((d) => d.decidedAtMs).map((d) => ({ d, t: (d.decidedAtMs! - d.createdAtMs) / DAY }));
  if (decidedTimes.length >= MIN_FOR_MEDIAN) {
    out.push({
      id: "time_to_decide",
      kind: "time_to_decide",
      title: `You usually take about ${days(median(decidedTimes.map((x) => x.t)))} to decide`,
      body: `Across ${decidedTimes.length} decisions, from when you started writing one down to when you marked it decided.`,
      basis: `Median of (date decided − date started). Needs at least ${MIN_FOR_MEDIAN} decisions.`,
      decisionIds: decidedTimes.map((x) => x.d.id),
    });
  }

  // 8. Time to look back (decided → outcome recorded)
  const reviewTimes = decisions.filter((d) => d.decidedAtMs && d.outcome).map((d) => ({ d, t: (d.outcome!.recordedAtMs - d.decidedAtMs!) / DAY })).filter((x) => x.t >= 0);
  if (reviewTimes.length >= MIN_FOR_MEDIAN) {
    out.push({
      id: "time_to_review",
      kind: "time_to_review",
      title: `You look back about ${days(median(reviewTimes.map((x) => x.t)))} after deciding`,
      body: `Across ${reviewTimes.length} decisions with a recorded outcome.`,
      basis: `Median of (date the outcome was recorded − date decided). Needs at least ${MIN_FOR_MEDIAN}.`,
      decisionIds: reviewTimes.map((x) => x.d.id),
    });
  }

  // 9. Lessons
  const withLessons = decisions.filter((d) => d.outcome?.lessons).sort((a, b) => b.outcome!.recordedAtMs - a.outcome!.recordedAtMs);
  if (withLessons.length > 0) {
    out.push({
      id: "lessons",
      kind: "lessons",
      title: `${withLessons.length} lesson${withLessons.length === 1 ? "" : "s"} you've written down`,
      body: withLessons.slice(0, 3).map((d) => `“${d.outcome!.lessons}”`).join("  "),
      basis: "The lessons you recorded when looking back, newest first.",
      decisionIds: withLessons.map((d) => d.id),
    });
  }

  return out;
}
