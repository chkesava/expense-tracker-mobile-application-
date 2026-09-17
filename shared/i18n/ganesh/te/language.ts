import type { language as EnLanguage } from "../en/language";
import type { NsOf } from "../keys";

export const language: NsOf<typeof EnLanguage> = {
  "language.member.title": "ప్రదర్శన భాష",
  "language.member.subtitle": "ఈ సభ్యుడు యాప్‌ను ఏ భాషలో చూడాలో ఎంచుకోండి",
  "language.member.saved": "భాష మార్చబడింది",
  "language.member.error": "ఈ సభ్యుడి భాషను మార్చలేకపోయాము.",
  "language.member.noPermission": "సభ్యుడి భాషను పండాల్ నిర్వాహకుడు మాత్రమే మార్చగలరు.",

  "language.pandal.title": "డిఫాల్ట్ భాష",
  "language.pandal.subtitle": "మీరు మార్చే వరకు కొత్త సభ్యులు ఈ భాషలోనే ప్రారంభిస్తారు",

  "language.member.cleared": "ఈ సభ్యుడు ఇప్పుడు పండాల్ డిఫాల్ట్ భాషను అనుసరిస్తారు",
  "language.pandal.saved": "డిఫాల్ట్ భాష మార్చబడింది",
  "language.member.inherit": "పండాల్ డిఫాల్ట్ ({{language}})",
  "language.row.meta": "భాష: {{language}}",
};
