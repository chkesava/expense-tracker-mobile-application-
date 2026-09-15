import type { common as EnCommon } from "../en/common";
import type { NsOf } from "../keys";

export const common: NsOf<typeof EnCommon> = {
  "common.action.save": "సేవ్ చేయండి",
  "common.action.cancel": "రద్దు చేయండి",
  "common.action.retry": "మళ్లీ ప్రయత్నించండి",
  "common.action.back": "వెనుకకు",
  "common.action.done": "పూర్తయింది",
  "common.action.remove": "తీసివేయండి",
  "common.action.close": "మూసివేయండి",
  "common.action.viewAll": "అన్నీ చూడండి",

  "common.state.loading": "లోడ్ అవుతోంది",
  "common.state.saving": "సేవ్ అవుతోంది",
  "common.state.offlineQueued": "సేవ్ చేశాము — ఆన్‌లైన్‌కి వచ్చాక సింక్ అవుతుంది",

  "common.error.generic": "ఏదో పొరపాటు జరిగింది. మళ్లీ ప్రయత్నించండి.",
  "common.error.connection": "మీ కనెక్షన్ చూసుకుని మళ్లీ ప్రయత్నించండి.",

  "common.role.admin": "పండాల్ నిర్వాహకుడు",
  "common.role.treasurer": "కోశాధికారి",
  "common.role.member": "సభ్యుడు",
  "common.role.collector": "వసూలుదారు",
  "common.role.viewer": "వీక్షకుడు",

  "common.role.unknown": "తెలియదు",
  "common.status.active": "సక్రియం",
  "common.status.suspended": "నిలిపివేయబడింది",
  "common.status.removed": "తీసివేయబడింది",
  "common.status.pending": "పెండింగ్‌లో ఉంది",
  "common.status.unknown": "తెలియదు",
};
