import type { language as EnLanguage } from "../en/language";
import type { NsOf } from "../keys";

export const language: NsOf<typeof EnLanguage> = {
  "language.member.title": "प्रदर्शन भाषा",
  "language.member.subtitle": "चुनें कि यह सदस्य ऐप किस भाषा में देखेगा",
  "language.member.saved": "भाषा बदल दी गई",
  "language.member.error": "इस सदस्य की भाषा नहीं बदली जा सकी।",
  "language.member.noPermission": "सदस्य की भाषा केवल पंडाल प्रशासक बदल सकता है।",

  "language.pandal.title": "डिफ़ॉल्ट भाषा",
  "language.pandal.subtitle": "नए सदस्य इसी भाषा से शुरू करेंगे, जब तक आप बदल न दें",

  "language.member.cleared": "सदस्य अब पंडाल की डिफ़ॉल्ट भाषा में देखेगा",
  "language.pandal.saved": "डिफ़ॉल्ट भाषा बदल दी गई",
  "language.member.inherit": "पंडाल डिफ़ॉल्ट ({{language}})",
  "language.row.meta": "भाषा: {{language}}",
};
