/**
 * Malayalam navigation labels.
 *
 * "പിരിവ്" is exactly the word used for a festival collection round in Kerala,
 * which is why it is preferred over a literal rendering of "collections".
 */

import type { nav as EnNav } from "../en/nav";
import type { NsOf } from "../keys";

export const nav: NsOf<typeof EnNav> = {
  "nav.home": "ഹോം",
  "nav.seva": "സേവ",
  "nav.funds": "നിധി",
  "nav.people": "അംഗങ്ങൾ",
  "nav.pandal": "പന്തൽ",
  "nav.collections": "പിരിവ്",
  "nav.expenses": "ചെലവുകൾ",
  "nav.contributions": "സംഭാവന",
  "nav.committee": "കമ്മിറ്റി",
  "nav.admin": "നിർവഹണം",
  "nav.a11y.goTo": "{{screen}} ലേക്ക് പോകുക",
};
