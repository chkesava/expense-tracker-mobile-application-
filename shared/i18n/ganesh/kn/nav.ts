/**
 * Kannada navigation labels.
 *
 * "ಚಂದಾ" (contributions) and "ವಸೂಲಿ" (collections) mirror the Hindi and Telugu
 * choices — the same two flows, named the way a Kannada committee names them.
 */

import type { nav as EnNav } from "../en/nav";
import type { NsOf } from "../keys";

export const nav: NsOf<typeof EnNav> = {
  "nav.home": "ಮುಖಪುಟ",
  "nav.seva": "ಸೇವೆ",
  "nav.funds": "ನಿಧಿ",
  "nav.people": "ಸದಸ್ಯರು",
  "nav.pandal": "ಪಂಡಾಲ್",
  "nav.collections": "ವಸೂಲಿ",
  "nav.expenses": "ಖರ್ಚು",
  "nav.contributions": "ಚಂದಾ",
  "nav.committee": "ಸಮಿತಿ",
  "nav.admin": "ನಿರ್ವಹಣೆ",
  "nav.a11y.goTo": "{{screen}} ಗೆ ಹೋಗಿ",
};
