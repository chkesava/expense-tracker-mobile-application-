import type { common as EnCommon } from "../en/common";
import type { NsOf } from "../keys";

export const common: NsOf<typeof EnCommon> = {
  "common.action.save": "சேமி",
  "common.action.cancel": "ரத்து செய்",
  "common.action.retry": "மீண்டும் முயற்சி",
  "common.action.back": "பின்செல்",
  "common.action.done": "முடிந்தது",
  "common.action.remove": "நீக்கு",
  "common.action.close": "மூடு",
  "common.action.viewAll": "அனைத்தையும் பார்",

  "common.state.loading": "ஏற்றுகிறது",
  "common.state.saving": "சேமிக்கிறது",
  "common.state.offlineQueued": "சேமித்தோம் — இணையம் வந்ததும் ஒத்திசைக்கும்",

  "common.error.generic": "ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.",
  "common.error.connection": "உங்கள் இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",

  "common.role.admin": "பந்தல் நிர்வாகி",
  "common.role.treasurer": "பொருளாளர்",
  "common.role.member": "உறுப்பினர்",
  "common.role.collector": "வசூலிப்பவர்",
  "common.role.viewer": "பார்ப்பவர்",

  "common.role.unknown": "தெரியவில்லை",
  "common.status.active": "செயலில்",
  "common.status.suspended": "இடைநிறுத்தப்பட்டது",
  "common.status.removed": "நீக்கப்பட்டது",
  "common.status.pending": "நிலுவையில்",
  "common.status.unknown": "தெரியவில்லை",
};
