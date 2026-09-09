/**
 * Bottom navigation and stack titles.
 *
 * These are the only labels every member sees on every screen, so they are the
 * first thing worth translating and the check that the whole pipeline works.
 */
export const nav = {
  "nav.home": "Home",
  "nav.seva": "Seva",
  "nav.funds": "Funds",
  "nav.people": "People",
  "nav.pandal": "Pandal",
  "nav.collections": "Collections",
  "nav.expenses": "Expenses",
  "nav.contributions": "Contributions",
  "nav.committee": "Committee",
  "nav.admin": "Admin",
  /** Screen-reader label for a tab button. */
  "nav.a11y.goTo": "Go to {{screen}}",
} as const;
