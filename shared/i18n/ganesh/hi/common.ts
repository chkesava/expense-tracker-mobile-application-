import type { common as EnCommon } from "../en/common";
import type { NsOf } from "../keys";

export const common: NsOf<typeof EnCommon> = {
  "common.action.save": "सहेजें",
  "common.action.cancel": "रद्द करें",
  "common.action.retry": "फिर कोशिश करें",
  "common.action.back": "वापस",
  "common.action.done": "पूर्ण",
  "common.action.remove": "हटाएँ",
  "common.action.close": "बंद करें",
  "common.action.viewAll": "सभी देखें",

  "common.state.loading": "लोड हो रहा है",
  "common.state.saving": "सहेजा जा रहा है",
  "common.state.offlineQueued": "सहेज लिया — ऑनलाइन होने पर सिंक हो जाएगा",

  "common.error.generic": "कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें।",
  "common.error.connection": "कृपया अपना कनेक्शन जाँचकर फिर कोशिश करें।",

  "common.role.admin": "पंडाल प्रशासक",
  "common.role.treasurer": "कोषाध्यक्ष",
  "common.role.member": "सदस्य",
  "common.role.collector": "वसूली कर्ता",
  "common.role.viewer": "दर्शक",

  "common.role.unknown": "अज्ञात",
  "common.status.active": "सक्रिय",
  "common.status.suspended": "निलंबित",
  "common.status.removed": "हटाया गया",
  "common.status.pending": "प्रतीक्षित",
  "common.status.unknown": "अज्ञात",
};
