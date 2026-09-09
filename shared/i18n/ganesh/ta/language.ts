import type { language as EnLanguage } from "../en/language";
import type { NsOf } from "../keys";

export const language: NsOf<typeof EnLanguage> = {
  "language.member.title": "காட்சி மொழி",
  "language.member.subtitle": "இந்த உறுப்பினர் செயலியை எந்த மொழியில் பார்ப்பார் என்பதைத் தேர்வு செய்யுங்கள்",
  "language.member.saved": "மொழி மாற்றப்பட்டது",
  "language.member.error": "இந்த உறுப்பினரின் மொழியை மாற்ற முடியவில்லை.",
  "language.member.noPermission": "உறுப்பினரின் மொழியை பந்தல் நிர்வாகி மட்டுமே மாற்ற முடியும்.",

  "language.pandal.title": "இயல்பு மொழி",
  "language.pandal.subtitle": "நீங்கள் மாற்றும் வரை புதிய உறுப்பினர்கள் இந்த மொழியில் தொடங்குவார்கள்",

  "language.member.cleared": "இந்த உறுப்பினர் இப்போது பந்தலின் இயல்பு மொழியைப் பின்பற்றுவார்",
  "language.pandal.saved": "இயல்பு மொழி மாற்றப்பட்டது",
  "language.member.inherit": "பந்தல் இயல்பு ({{language}})",
  "language.row.meta": "மொழி: {{language}}",
};
