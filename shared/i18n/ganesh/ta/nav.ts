/**
 * Tamil navigation labels.
 *
 * "வசூல்" is the collection round a ward collector walks, "நன்கொடை" the
 * contribution a household promises or pays — two different screens, so two
 * clearly different words.
 */

import type { nav as EnNav } from "../en/nav";
import type { NsOf } from "../keys";

export const nav: NsOf<typeof EnNav> = {
  "nav.home": "முகப்பு",
  "nav.seva": "சேவை",
  "nav.funds": "நிதி",
  "nav.people": "உறுப்பினர்",
  "nav.pandal": "பந்தல்",
  "nav.collections": "வசூல்",
  "nav.expenses": "செலவுகள்",
  "nav.contributions": "நன்கொடை",
  "nav.committee": "குழு",
  "nav.admin": "நிர்வாகம்",
  "nav.a11y.goTo": "{{screen}} க்குச் செல்",
};
