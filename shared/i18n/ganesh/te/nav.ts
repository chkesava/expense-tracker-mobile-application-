/**
 * Telugu navigation labels.
 *
 * "చందా" (contributions) and "వసూళ్లు" (collections) are the words a Telugu
 * pandal committee uses for these two very different flows, and keeping them
 * distinct matters — the app's whole point is that promised and received money
 * never blur together.
 */

import type { nav as EnNav } from "../en/nav";
import type { NsOf } from "../keys";

export const nav: NsOf<typeof EnNav> = {
  "nav.home": "హోమ్",
  "nav.seva": "సేవ",
  "nav.funds": "నిధి",
  "nav.people": "సభ్యులు",
  "nav.pandal": "పండాల్",
  "nav.collections": "వసూళ్లు",
  "nav.expenses": "ఖర్చులు",
  "nav.contributions": "చందా",
  "nav.committee": "కమిటీ",
  "nav.admin": "నిర్వహణ",
  "nav.a11y.goTo": "{{screen}}కి వెళ్లండి",
};
