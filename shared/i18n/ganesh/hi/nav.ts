/**
 * Hindi navigation labels.
 *
 * Festival vocabulary is kept as the word a committee actually uses rather than
 * a dictionary translation — "चंदा" for contributions and "वसूली" for
 * collections are what gets said at a pandal, and "पंडाल" / "सेवा" stay
 * transliterated because they are the domain's own terms.
 */

import type { nav as EnNav } from "../en/nav";
import type { NsOf } from "../keys";

export const nav: NsOf<typeof EnNav> = {
  "nav.home": "होम",
  "nav.seva": "सेवा",
  "nav.funds": "निधि",
  "nav.people": "सदस्य",
  "nav.pandal": "पंडाल",
  "nav.collections": "वसूली",
  "nav.expenses": "खर्च",
  "nav.contributions": "चंदा",
  "nav.committee": "समिति",
  "nav.admin": "प्रबंधन",
  "nav.a11y.goTo": "{{screen}} पर जाएँ",
};
